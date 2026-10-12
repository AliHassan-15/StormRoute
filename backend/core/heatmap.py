"""
Trip-corridor weather heatmap frames (D12, D15, D16).

Hour 0 is departure rounded to the nearest hour (ties round up); frames cover
0..48 inclusive (49 frames). Corridor sampling uses full-resolution geometry.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from core.geo import (
    LatLng,
    cumulative_distance_mi,
    destination_point,
    initial_bearing_deg,
    interpolate_along,
    scale_to_total,
)
from core.risk import Weather, assess
from core.routing_client import RouteData
from core.weather_client import (
    WeatherSeries,
    fetch_hourly,
    snap_point,
    value_at,
)

FRAME_COUNT = 49
LATERAL_OFFSET_MI = 12.0
MAX_POINTS = 300
# Equatorial miles per degree longitude (meridian golden tests).
MI_PER_DEG_LNG_EQUATOR = 69.09


def round_departure_to_t0(departure_utc: datetime) -> datetime:
    """
    Round departure to the nearest hour (D15).

    Ties (exactly :30) round UP. Units: returns aware UTC datetime on the hour.
    """
    if departure_utc.tzinfo is None:
        departure_utc = departure_utc.replace(tzinfo=UTC)
    else:
        departure_utc = departure_utc.astimezone(UTC)

    floored = departure_utc.replace(minute=0, second=0, microsecond=0)
    # Spec: 12:29 -> 12:00, 12:30 -> 13:00 (tie rounds up).
    if departure_utc - floored >= timedelta(minutes=30):
        return floored + timedelta(hours=1)
    return floored


def frame_datetimes(t0_utc: datetime) -> list[datetime]:
    """Return 49 hourly UTC datetimes starting at t0 (hours 0..48)."""
    if t0_utc.tzinfo is None:
        t0_utc = t0_utc.replace(tzinfo=UTC)
    else:
        t0_utc = t0_utc.astimezone(UTC)
    return [t0_utc + timedelta(hours=h) for h in range(FRAME_COUNT)]


def spacing_mi(route_mi: float) -> float:
    """S = clamp(route_mi / 60, 10, 50). Units: miles."""
    return min(50.0, max(10.0, route_mi / 60.0))


def _bearing_at_mile(coords: list[LatLng], cum: list[float], mile: float) -> float:
    """Local bearing from neighbouring vertices around `mile`."""
    if len(coords) < 2:
        return 0.0
    # Nudge slightly ahead for a forward bearing; fall back behind near the end.
    ahead_mi = min(cum[-1], mile + 0.25)
    behind_mi = max(0.0, mile - 0.25)
    a = interpolate_along(coords, cum, behind_mi)
    b = interpolate_along(coords, cum, ahead_mi)
    if a == b:
        if mile < cum[-1]:
            b = interpolate_along(coords, cum, min(cum[-1], mile + 1.0))
        else:
            a = interpolate_along(coords, cum, max(0.0, mile - 1.0))
    if a == b:
        return 0.0
    return initial_bearing_deg(a, b)


def corridor_points_for_route(
    route: RouteData,
    spacing_s_mi: float,
    *,
    lateral_mi: float = LATERAL_OFFSET_MI,
) -> list[LatLng]:
    """
    Sample points every S miles along full geometry with lateral ±L offsets.

    Units: spacing_s_mi and lateral_mi are miles.
    """
    if route.distance_mi <= 0 or len(route.coords) < 2:
        return []
    cum = route.cum_dist_mi
    coords = route.coords
    if not cum or cum[-1] <= 0:
        cum = scale_to_total(cumulative_distance_mi(coords), route.distance_mi)

    miles: list[float] = [0.0]
    m = spacing_s_mi
    while m < route.distance_mi - 1e-9:
        miles.append(m)
        m += spacing_s_mi
    if miles[-1] < route.distance_mi - 1e-6:
        miles.append(route.distance_mi)

    points: list[LatLng] = []
    for mile in miles:
        center = interpolate_along(coords, cum, mile)
        bearing = _bearing_at_mile(coords, cum, mile)
        left = destination_point(center, lateral_mi, (bearing - 90.0) % 360.0)
        right = destination_point(center, lateral_mi, (bearing + 90.0) % 360.0)
        points.extend((left, center, right))
    return points


def build_corridor_grid(routes: list[RouteData]) -> list[LatLng]:
    """
    Build snapped, deduped corridor points across routes.

    Cap at 300: while over cap, multiply each route's S by 1.25 and rebuild.
    """
    if not routes:
        return []

    factors = {route.id: 1.0 for route in routes}
    for _ in range(40):
        raw: list[LatLng] = []
        for route in routes:
            s = spacing_mi(route.distance_mi) * factors[route.id]
            raw.extend(corridor_points_for_route(route, s))
        seen: set[tuple[float, float]] = set()
        deduped: list[LatLng] = []
        for point in raw:
            snapped = snap_point(point)
            key = (snapped.lat, snapped.lng)
            if key not in seen:
                seen.add(key)
                deduped.append(snapped)
        if len(deduped) <= MAX_POINTS:
            return deduped
        for route_id in factors:
            factors[route_id] *= 1.25
    return deduped[:MAX_POINTS]


def _series_values_at_frames(
    series: WeatherSeries | None,
    frames: list[datetime],
    load_lb: float,
) -> tuple[
    list[float | None],
    list[float | None],
    list[float | None],
    list[int | None],
]:
    wind: list[float | None] = []
    rain: list[float | None] = []
    snow: list[float | None] = []
    risk: list[int | None] = []
    for frame in frames:
        if series is None:
            wind.append(None)
            rain.append(None)
            snow.append(None)
            risk.append(None)
            continue
        sample = value_at(series, frame)
        if (
            sample.status != "ok"
            or sample.wind_mph is None
            or sample.rain_in_hr is None
            or sample.snow_in_hr is None
        ):
            # Missing / out_of_range -> null (never zero-filled as Low).
            wind.append(None)
            rain.append(None)
            snow.append(None)
            risk.append(None)
            continue
        w = float(sample.wind_mph)
        r = float(sample.rain_in_hr)
        s = float(sample.snow_in_hr)
        level = int(
            assess(
                Weather(wind_mph=w, rain_in_hr=r, snow_in_hr=s, gust_mph=sample.gust_mph),
                load_lb=load_lb,
            ).final_level
        )
        wind.append(round(w, 1))
        rain.append(round(r, 3))
        snow.append(round(s, 3))
        risk.append(level)
    return wind, rain, snow, risk


def build_heatmap(
    routes: list[RouteData],
    departure_utc: datetime,
    load_lb: float,
    *,
    session: Any | None = None,
) -> dict[str, Any]:
    """
    Build heatmap response payload for the corridor.

    Returns {t0_utc, frame_count, points, notices}.
    """
    notices: list[str] = []
    t0 = round_departure_to_t0(departure_utc)
    frames = frame_datetimes(t0)
    points = build_corridor_grid(routes)
    if not points:
        return {
            "t0_utc": t0.isoformat().replace("+00:00", "Z"),
            "frame_count": FRAME_COUNT,
            "points": [],
            "notices": ["No corridor points available for heatmap."],
        }

    start_date = frames[0].date()
    end_date = frames[-1].date()
    series_by_point = fetch_hourly(
        points,
        start_date,
        end_date,
        session=session,
    )

    out_points: list[dict[str, Any]] = []
    for point in points:
        key = (point.lat, point.lng)
        series = series_by_point.get(key)
        wind, rain, snow, risk = _series_values_at_frames(series, frames, load_lb)
        out_points.append(
            {
                "lat": point.lat,
                "lng": point.lng,
                "wind": wind,
                "rain": rain,
                "snow": snow,
                "risk": risk,
            }
        )

    if len(out_points) >= MAX_POINTS:
        notices.append(f"Heatmap capped at {MAX_POINTS} corridor points.")

    return {
        "t0_utc": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "frame_count": FRAME_COUNT,
        "points": out_points,
        "notices": notices,
    }


def serialized_size_bytes(payload: dict[str, Any]) -> int:
    """UTF-8 JSON size in bytes (for tests)."""
    return len(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
