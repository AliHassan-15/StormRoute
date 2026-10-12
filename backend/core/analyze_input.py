"""Analyze request validation and JSON sanitization (D14)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from core.errors import ValidationAppError
from core.geo import LatLng, haversine_mi

IntervalInput = str | int

ALLOWED_INTERVALS = {10, 25, 50}
MAX_LOAD_LB = 200_000.0
MIN_SEPARATION_MI = 1.0


@dataclass(frozen=True)
class PlaceInput:
    """Origin or destination with label and coordinates."""

    label: str
    lat: float
    lng: float


@dataclass(frozen=True)
class AnalyzeInput:
    """Validated analyze request in domain form."""

    origin: PlaceInput
    destination: PlaceInput
    departure_utc: datetime
    load_lb: float
    interval: IntervalInput


def _finite(value: float, field: str) -> float:
    if not math.isfinite(value):
        raise ValidationAppError(
            "Request validation failed.",
            details={field: ["Must be a finite number."]},
        )
    return float(value)


def parse_departure(value: str | datetime) -> datetime:
    """Parse ISO-8601 departure WITH offset into aware UTC (D14)."""
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError as exc:
            raise ValidationAppError(
                "Request validation failed.",
                details={
                    "departure_time": ["Must be ISO-8601 with a timezone offset."],
                },
            ) from exc
    if dt.tzinfo is None:
        raise ValidationAppError(
            "Request validation failed.",
            details={"departure_time": ["Timezone offset is required."]},
        )
    return dt.astimezone(UTC)


def validate_analyze_input(
    *,
    origin: dict[str, Any],
    destination: dict[str, Any],
    departure_time: str | datetime,
    load_lb: float,
    interval: IntervalInput,
    now_utc: datetime | None = None,
) -> AnalyzeInput:
    """Validate analyze fields per D14; raise ValidationAppError with field details."""
    details: dict[str, list[str]] = {}
    now = now_utc or datetime.now(tz=UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    else:
        now = now.astimezone(UTC)

    try:
        o_lat = _finite(float(origin["lat"]), "origin.lat")
        o_lng = _finite(float(origin["lng"]), "origin.lng")
        o_label = str(origin.get("label") or "").strip() or f"{o_lat:.4f},{o_lng:.4f}"
    except (KeyError, TypeError, ValueError):
        details["origin"] = ["Must include label, lat, and lng."]
        o_lat = o_lng = 0.0
        o_label = ""

    try:
        d_lat = _finite(float(destination["lat"]), "destination.lat")
        d_lng = _finite(float(destination["lng"]), "destination.lng")
        d_label = str(destination.get("label") or "").strip() or f"{d_lat:.4f},{d_lng:.4f}"
    except (KeyError, TypeError, ValueError):
        details["destination"] = ["Must include label, lat, and lng."]
        d_lat = d_lng = 0.0
        d_label = ""

    try:
        load = _finite(float(load_lb), "load_lb")
        if load < 0 or load > MAX_LOAD_LB:
            details["load_lb"] = [f"Must be between 0 and {int(MAX_LOAD_LB)} lb."]
    except (TypeError, ValueError):
        details["load_lb"] = ["Must be a number."]
        load = 0.0

    interval_norm: IntervalInput
    if interval == "auto" or interval is None:
        interval_norm = "auto"
    else:
        try:
            interval_int = int(interval)
            if interval_int not in ALLOWED_INTERVALS:
                details["interval"] = ["Must be 'auto', 10, 25, or 50."]
                interval_norm = "auto"
            else:
                interval_norm = interval_int
        except (TypeError, ValueError):
            details["interval"] = ["Must be 'auto', 10, 25, or 50."]
            interval_norm = "auto"

    try:
        departure_utc = parse_departure(departure_time)
    except ValidationAppError as exc:
        details["departure_time"] = (
            exc.details.get("departure_time", [exc.message])
            if isinstance(exc.details, dict)
            else [exc.message]
        )
        departure_utc = now

    earliest = now - timedelta(hours=1)
    latest = now + timedelta(days=14)
    if "departure_time" not in details:
        if departure_utc < earliest:
            details["departure_time"] = ["Must be no earlier than 1 hour ago."]
        elif departure_utc > latest:
            details["departure_time"] = ["Must be within the next 14 days."]

    if "origin" not in details and "destination" not in details:
        try:
            if haversine_mi(LatLng(o_lat, o_lng), LatLng(d_lat, d_lng)) < MIN_SEPARATION_MI:
                details["destination"] = [
                    "Origin and destination must be at least 1 mile apart."
                ]
        except ValueError as exc:
            details["origin"] = [str(exc)]

    if details:
        raise ValidationAppError("Request validation failed.", details=details)

    return AnalyzeInput(
        origin=PlaceInput(label=o_label, lat=o_lat, lng=o_lng),
        destination=PlaceInput(label=d_label, lat=d_lat, lng=d_lng),
        departure_utc=departure_utc,
        load_lb=load,
        interval=interval_norm,
    )


def sanitize_json(value: Any) -> Any:
    """Replace NaN/Infinity with None so JSON never contains non-finite numbers."""
    if isinstance(value, float):
        if not math.isfinite(value):
            return None
        return value
    if isinstance(value, dict):
        return {k: sanitize_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_json(v) for v in value]
    return value
