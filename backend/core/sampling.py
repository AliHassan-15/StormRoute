"""
Checkpoint sampling, ETA interpolation, coverage, and local times (D5–D8, D13).

Distances are miles; durations are seconds; ETAs are timezone-aware UTC.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from core.geo import interpolate_along
from core.routing_client import RouteData

ALLOWED_INTERVALS = (10, 25, 50)
MAX_CHECKPOINTS = 150

try:
    from timezonefinder import TimezoneFinder as _TimezoneFinder

    _tf: _TimezoneFinder | None = _TimezoneFinder()
except Exception:  # pragma: no cover - Windows often lacks a C toolchain for wheels
    _tf = None
    from tzfpy import get_tz as _tzf_get_tz


@dataclass(frozen=True)
class Checkpoint:
    """A sampled point along a route with ETA and optional weather."""

    index: int
    mile: float
    lat: float
    lng: float
    eta_utc: datetime
    timezone: str = "UTC"
    eta_local: str = ""
    weather_status: Literal["ok", "missing", "out_of_range"] = "ok"
    wind_mph: float | None = None
    gust_mph: float | None = None
    rain_in_hr: float | None = None
    snow_in_hr: float | None = None


@dataclass(frozen=True)
class CheckpointPlan:
    """Result of build_checkpoints including the interval actually used."""

    checkpoints: list[Checkpoint]
    interval_used: int
    notice: str | None


def auto_interval(total_mi: float) -> int:
    """Choose sampling interval in miles from total route distance (D6)."""
    if total_mi <= 150:
        return 10
    if total_mi <= 500:
        return 25
    return 50


def _checkpoint_miles(total_mi: float, interval_mi: int) -> list[float]:
    """Build mile markers: 0, k*interval, ..., destination with D6 drop rule."""
    if total_mi < 0:
        raise ValueError("total_mi must be >= 0")
    if interval_mi <= 0:
        raise ValueError("interval_mi must be > 0")

    miles: list[float] = [0.0]
    if total_mi == 0:
        return miles

    k = 1
    while k * interval_mi < total_mi - 1e-12:
        miles.append(float(k * interval_mi))
        k += 1

    threshold = 0.25 * interval_mi
    if len(miles) > 1 and (total_mi - miles[-1]) <= threshold + 1e-12:
        miles.pop()

    if miles[-1] != total_mi:
        miles.append(float(total_mi))
    return miles


def count_checkpoints(total_mi: float, interval_mi: int) -> int:
    """Number of checkpoints that would be produced for total_mi and interval."""
    return len(_checkpoint_miles(total_mi, interval_mi))


def resolve_interval(total_mi: float, requested_mi: int) -> tuple[int, str | None]:
    """
    Ensure checkpoint count <= 150 by raising the interval when needed.

    Prefers the next allowed interval (10/25/50), then steps by 25 mi.
    """
    if requested_mi not in ALLOWED_INTERVALS:
        raise ValueError(f"interval must be one of {ALLOWED_INTERVALS}, got {requested_mi}")

    notice: str | None = None
    candidates = [i for i in ALLOWED_INTERVALS if i >= requested_mi]
    for interval in candidates:
        if count_checkpoints(total_mi, interval) <= MAX_CHECKPOINTS:
            if interval != requested_mi:
                notice = (
                    f"Checkpoint interval raised from {requested_mi} to {interval} mi "
                    f"to stay within {MAX_CHECKPOINTS} checkpoints."
                )
            return interval, notice

    interval = max(ALLOWED_INTERVALS)
    while count_checkpoints(total_mi, interval) > MAX_CHECKPOINTS:
        interval += 25
    notice = (
        f"Checkpoint interval raised from {requested_mi} to {interval} mi "
        f"to stay within {MAX_CHECKPOINTS} checkpoints."
    )
    return interval, notice


def duration_at_mile(route: RouteData, mile: float) -> float:
    """
    Interpolate cumulative duration (seconds) at a distance mile along the route.

    Uses per-segment durations from cum_dur_s / cum_dist_mi (D7) — never average speed.
    """
    if mile <= route.cum_dist_mi[0]:
        return route.cum_dur_s[0]
    if mile >= route.cum_dist_mi[-1]:
        return route.cum_dur_s[-1]
    for i in range(1, len(route.cum_dist_mi)):
        if mile <= route.cum_dist_mi[i]:
            d0, d1 = route.cum_dist_mi[i - 1], route.cum_dist_mi[i]
            t0, t1 = route.cum_dur_s[i - 1], route.cum_dur_s[i]
            span = d1 - d0
            frac = 0.0 if span <= 0 else (mile - d0) / span
            return t0 + (t1 - t0) * frac
    return route.cum_dur_s[-1]


def resolve_timezone_name(lat: float, lng: float) -> str:
    """
    Resolve IANA timezone for a point (D13).

    Prefers timezonefinder when available; falls back to tzfpy. Open-water /
    Etc/* zones fall back to UTC.
    """
    if _tf is not None:
        name = _tf.timezone_at(lat=lat, lng=lng)
    else:
        name = _tzf_get_tz(lng, lat)
    if not name or name.startswith("Etc/"):
        return "UTC"
    return name


def local_time_for(lat: float, lng: float, eta_utc: datetime) -> tuple[str, str]:
    """
    Convert UTC ETA to local ISO-8601 with offset and IANA timezone name (D13).

    Falls back to UTC over water / unknown zones. Returns (iso_local, iana_name).
    """
    if eta_utc.tzinfo is None:
        eta_utc = eta_utc.replace(tzinfo=UTC)
    else:
        eta_utc = eta_utc.astimezone(UTC)

    name = resolve_timezone_name(lat, lng)
    try:
        zi = ZoneInfo(name) if name != "UTC" else UTC
    except ZoneInfoNotFoundError:
        local = eta_utc.astimezone(UTC)
        return local.isoformat(), "UTC"
    local = eta_utc.astimezone(zi)
    return local.isoformat(), name


def build_checkpoints(
    route: RouteData,
    interval_mi: int,
    departure_utc: datetime,
) -> CheckpointPlan:
    """
    Sample checkpoints along route at interval_mi (D6) with ETAs (D7) and local times (D13).

    interval_mi must be in {10, 25, 50}; it may be raised to enforce the 150-cap.
    """
    if departure_utc.tzinfo is None:
        departure_utc = departure_utc.replace(tzinfo=UTC)
    else:
        departure_utc = departure_utc.astimezone(UTC)

    interval_used, notice = resolve_interval(route.distance_mi, interval_mi)
    miles = _checkpoint_miles(route.distance_mi, interval_used)
    checkpoints: list[Checkpoint] = []

    for index, mile in enumerate(miles):
        point = interpolate_along(route.coords, route.cum_dist_mi, mile)
        eta = departure_utc + timedelta(seconds=duration_at_mile(route, mile))
        eta_local, tz_name = local_time_for(point.lat, point.lng, eta)
        checkpoints.append(
            Checkpoint(
                index=index,
                mile=mile,
                lat=point.lat,
                lng=point.lng,
                eta_utc=eta,
                timezone=tz_name,
                eta_local=eta_local,
            )
        )

    return CheckpointPlan(
        checkpoints=checkpoints,
        interval_used=interval_used,
        notice=notice,
    )


def coverage(checkpoints: list[Checkpoint], total_mi: float) -> list[tuple[float, float]]:
    """
    Coverage spans per checkpoint (D8).

    Origin: 0 → midpoint to next; destination: midpoint from previous → end;
    middle: midpoints to neighbours. Spans sum exactly to total_mi.
    """
    if not checkpoints:
        return []
    miles = [cp.mile for cp in checkpoints]
    spans: list[tuple[float, float]] = []
    for i, _mile in enumerate(miles):
        if i == 0:
            from_mi = 0.0
            to_mi = (miles[0] + miles[1]) / 2.0 if len(miles) > 1 else float(total_mi)
        elif i == len(miles) - 1:
            from_mi = (miles[i - 1] + miles[i]) / 2.0
            to_mi = float(total_mi)
        else:
            from_mi = (miles[i - 1] + miles[i]) / 2.0
            to_mi = (miles[i] + miles[i + 1]) / 2.0
        spans.append((from_mi, to_mi))

    # Correct tiny float drift so spans sum exactly to total_mi.
    covered = sum(to_mi - from_mi for from_mi, to_mi in spans)
    if spans and abs(covered - total_mi) > 1e-9:
        from_mi, to_mi = spans[-1]
        spans[-1] = (from_mi, to_mi + (total_mi - covered))
    return spans


def with_weather(
    checkpoint: Checkpoint,
    *,
    status: Literal["ok", "missing", "out_of_range"],
    wind_mph: float | None = None,
    gust_mph: float | None = None,
    rain_in_hr: float | None = None,
    snow_in_hr: float | None = None,
) -> Checkpoint:
    """Return a copy of checkpoint with weather fields filled."""
    return replace(
        checkpoint,
        weather_status=status,
        wind_mph=wind_mph,
        gust_mph=gust_mph,
        rain_in_hr=rain_in_hr,
        snow_in_hr=snow_in_hr,
    )
