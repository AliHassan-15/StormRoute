"""
End-to-end trip analysis orchestration (pure domain; no Django).

Pipeline: routes -> checkpoints -> one weather fetch -> risk -> score -> rank.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any

# Re-export validation helpers for callers/tests.
from core.analyze_input import (  # noqa: F401
    AnalyzeInput,
    PlaceInput,
    parse_departure,
    sanitize_json,
    validate_analyze_input,
)
from core.geo import LatLng, display_geometry
from core.risk import RiskLevel, Weather, assess
from core.routing_client import RouteData, RoutesResult, fetch_routes
from core.sampling import Checkpoint, auto_interval, build_checkpoints, coverage
from core.scoring import (
    CheckpointLevel,
    RankedRoute,
    build_explanation,
    rank_routes,
    score_route,
)
from core.weather_client import attach_weather, date_window_for_etas, fetch_hourly


def _resolve_base_interval(routes: list[RouteData], interval: str | int) -> int:
    if interval == "auto":
        max_mi = max(route.distance_mi for route in routes)
        return auto_interval(max_mi)
    return int(interval)


def _assessed_checkpoint(
    cp: Checkpoint,
    load_lb: float,
    cov_from: float,
    cov_to: float,
) -> dict[str, Any]:
    weather_obj: dict[str, float | None] | None = None
    level: int | None = None
    level_name = "UNKNOWN"
    condition_levels: dict[str, str] | None = None
    reasons: list[str] = []
    level_enum: RiskLevel | None = None

    if cp.weather_status == "ok" and cp.wind_mph is not None:
        weather_obj = {
            "wind_mph": cp.wind_mph,
            "gust_mph": cp.gust_mph,
            "rain_in_hr": cp.rain_in_hr,
            "snow_in_hr": cp.snow_in_hr,
        }
        if cp.rain_in_hr is not None and cp.snow_in_hr is not None:
            risk = assess(
                Weather(
                    wind_mph=cp.wind_mph,
                    rain_in_hr=cp.rain_in_hr,
                    snow_in_hr=cp.snow_in_hr,
                    gust_mph=cp.gust_mph,
                ),
                load_lb=load_lb,
            )
            level = int(risk.final_level)
            level_name = risk.final_level.name
            level_enum = risk.final_level
            condition_levels = {
                "wind": risk.wind_level.name,
                "rain": risk.rain_level.name,
                "snow": risk.snow_level.name,
            }
            reasons = list(risk.reasons)

    return {
        "index": cp.index,
        "mile": cp.mile,
        "lat": cp.lat,
        "lng": cp.lng,
        "eta_utc": cp.eta_utc.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "eta_local": cp.eta_local,
        "tz": cp.timezone,
        "coverage_from_mi": cov_from,
        "coverage_to_mi": cov_to,
        "weather": weather_obj,
        "weather_status": cp.weather_status,
        "level": level,
        "level_name": level_name,
        "condition_levels": condition_levels,
        "reasons": reasons,
        "_level_enum": level_enum,
    }


def _metrics_dict(metrics: Any) -> dict[str, Any]:
    worst = metrics.worst_level
    return {
        "miles_by_level": dict(metrics.miles_by_level),
        "severe_miles": metrics.severe_miles,
        "high_miles": metrics.high_miles,
        "no_travel_miles": metrics.no_travel_miles,
        "avg_risk": None if metrics.avg_risk is None else round(metrics.avg_risk, 2),
        "worst_level": worst.name if worst is not None else None,
    }


def run_analyze(
    data: AnalyzeInput,
    *,
    token: str,
    now_utc: datetime | None = None,
    routes_result: RoutesResult | None = None,
) -> dict[str, Any]:
    """
    Execute the full analyze pipeline and return an AnalyzeResponse dict.

    Uses a thread pool for upstream Mapbox / Open-Meteo calls. Weather for all
    route checkpoints is fetched in one deduplicated batch. Optional
    ``routes_result`` reuses a prefetched RoutesResult (e.g. for cache seeding).
    """
    now = now_utc or datetime.now(tz=UTC)
    notices: list[str] = []
    origin = LatLng(lat=data.origin.lat, lng=data.origin.lng)
    destination = LatLng(lat=data.destination.lat, lng=data.destination.lng)

    if routes_result is None:
        with ThreadPoolExecutor(max_workers=4) as pool:
            routes_result = pool.submit(
                fetch_routes,
                origin,
                destination,
                token=token,
            ).result()

    if routes_result.notice:
        notices.append(routes_result.notice)

    routes = routes_result.routes
    base_interval = _resolve_base_interval(routes, data.interval)
    interval_used = base_interval

    plans = []
    for route in routes:
        plan = build_checkpoints(route, base_interval, data.departure_utc)
        plans.append(plan)
        interval_used = max(interval_used, plan.interval_used)
        if plan.notice:
            notices.append(f"{route.label}: {plan.notice}")

    all_checkpoints: list[Checkpoint] = []
    for plan in plans:
        all_checkpoints.extend(plan.checkpoints)

    series_by_point: dict[tuple[float, float], Any] = {}
    if all_checkpoints:
        start_date, end_date = date_window_for_etas(
            [cp.eta_utc for cp in all_checkpoints]
        )
        max_end = (now + timedelta(days=15)).date()
        if end_date > max_end:
            end_date = max_end
            notices.append(
                "Some checkpoint ETAs may fall outside the available forecast window."
            )
        points = [LatLng(lat=cp.lat, lng=cp.lng) for cp in all_checkpoints]
        with ThreadPoolExecutor(max_workers=1) as pool:
            series_by_point = pool.submit(
                fetch_hourly,
                points,
                start_date,
                end_date,
            ).result()

    enriched_by_route = [
        attach_weather(plan.checkpoints, series_by_point) for plan in plans
    ]

    if any(
        cp.weather_status == "out_of_range"
        for group in enriched_by_route
        for cp in group
    ):
        if not any("forecast window" in n for n in notices):
            notices.append(
                "One or more checkpoints are outside the available weather forecast."
            )

    rank_input: list[tuple[str, str, Any, float, float, list[float]]] = []
    route_payloads_raw: list[dict[str, Any]] = []

    for route, enriched in zip(routes, enriched_by_route, strict=True):
        spans = coverage(enriched, route.distance_mi)
        assessed: list[dict[str, Any]] = []
        level_items: list[CheckpointLevel] = []
        no_travel_at: list[float] = []
        for cp, (cov_from, cov_to) in zip(enriched, spans, strict=True):
            row = _assessed_checkpoint(cp, data.load_lb, cov_from, cov_to)
            level_enum: RiskLevel | None = row.pop("_level_enum")
            assessed.append(row)
            level_items.append(
                CheckpointLevel(
                    level=level_enum,
                    coverage_from_mi=cov_from,
                    coverage_to_mi=cov_to,
                    mile=cp.mile,
                )
            )
            if level_enum is RiskLevel.NO_TRAVEL:
                no_travel_at.append(cp.mile)

        metrics = score_route(level_items, route.distance_mi, route.duration_s)
        arrival = enriched[-1] if enriched else None
        route_payloads_raw.append(
            {
                "id": route.id,
                "label": route.label,
                "distance_mi": route.distance_mi,
                "duration_s": route.duration_s,
                "arrival_utc": (
                    arrival.eta_utc.astimezone(UTC).isoformat().replace("+00:00", "Z")
                    if arrival
                    else None
                ),
                "arrival_local": arrival.eta_local if arrival else None,
                "geometry": display_geometry(route.coords),
                "checkpoints": assessed,
            }
        )
        rank_input.append(
            (
                route.id,
                route.label,
                metrics,
                route.duration_s,
                route.distance_mi,
                no_travel_at,
            )
        )

    ranked: list[RankedRoute] = rank_routes(rank_input)
    rec_id, explanation, all_blocked = build_explanation(ranked)
    ranked_by_id = {item.id: item for item in ranked}

    routes_out: list[dict[str, Any]] = []
    for raw in route_payloads_raw:
        ranked_item = ranked_by_id[raw["id"]]
        routes_out.append(
            {
                "id": raw["id"],
                "label": raw["label"],
                "rank": ranked_item.rank,
                "is_recommended": ranked_item.is_recommended,
                "is_blocked": ranked_item.metrics.is_blocked,
                "distance_mi": raw["distance_mi"],
                "duration_s": raw["duration_s"],
                "delay_vs_fastest_s": ranked_item.delay_vs_fastest_s,
                "arrival_utc": raw["arrival_utc"],
                "arrival_local": raw["arrival_local"],
                "geometry": raw["geometry"],
                "metrics": _metrics_dict(ranked_item.metrics),
                "checkpoints": raw["checkpoints"],
            }
        )
    routes_out.sort(key=lambda item: item["rank"])

    payload = {
        "request_id": str(uuid.uuid4()),
        "generated_at_utc": now.astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "input": {
            "origin": {
                "label": data.origin.label,
                "lat": data.origin.lat,
                "lng": data.origin.lng,
            },
            "destination": {
                "label": data.destination.label,
                "lat": data.destination.lat,
                "lng": data.destination.lng,
            },
            "departure_time_utc": data.departure_utc.isoformat().replace("+00:00", "Z"),
            "load_lb": data.load_lb,
            "interval_requested": data.interval,
            "interval_used_mi": interval_used,
        },
        "routes": routes_out,
        "recommendation": {
            "route_id": rec_id,
            "explanation": explanation,
            "all_blocked": all_blocked,
        },
        "notices": notices,
    }
    return sanitize_json(payload)
