"""
Mapbox Directions client (D7, D11, D18, D20).

Uses profile mapbox/driving with alternatives and documented fallbacks.
Never fabricates routes. Distances are miles; durations are seconds.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests

from core.errors import (
    NoRouteError,
    UpstreamBadGatewayError,
    UpstreamRateLimitError,
    UpstreamTimeoutError,
)
from core.geo import LatLng, cumulative_distance_mi, display_geometry, haversine_mi, scale_to_total
from core.routing_overlap import is_distinct, overlap_ratio, sample_grid_cells, via_offset_points

METERS_PER_MILE = 1609.344
DIRECTIONS_URL = "https://api.mapbox.com/directions/v5/mapbox/driving/{coordinates}"
REQUEST_TIMEOUT_S = 10.0

# Re-export overlap helpers for tests/callers.
__all__ = [
    "RouteData",
    "RoutesResult",
    "fetch_routes",
    "overlap_ratio",
    "parse_route",
    "route_to_api_dict",
    "sample_grid_cells",
]


@dataclass(frozen=True)
class RouteData:
    """One distinct driving route with scaled cumulative arrays."""

    id: str
    label: str
    coords: list[LatLng]
    cum_dist_mi: list[float]
    cum_dur_s: list[float]
    distance_mi: float
    duration_s: float


@dataclass(frozen=True)
class RoutesResult:
    """Sorted routes plus an optional notice when fewer than three exist."""

    routes: list[RouteData]
    notice: str | None


def _meters_to_mi(meters: float) -> float:
    return meters / METERS_PER_MILE


def _coords_from_geojson(coordinates: list[list[float]]) -> list[LatLng]:
    """Parse GeoJSON [lng, lat] pairs into LatLng list (D20)."""
    return [LatLng(lat=float(pair[1]), lng=float(pair[0])) for pair in coordinates]


def _concat_leg_annotations(legs: list[dict[str, Any]], key: str) -> list[float]:
    """Concatenate per-leg annotation arrays (distance meters or duration seconds)."""
    values: list[float] = []
    for leg in legs:
        annotation = leg.get("annotation") or {}
        chunk = annotation.get(key) or []
        values.extend(float(v) for v in chunk)
    return values


def _cumulative_from_segments(segment_values: list[float]) -> list[float]:
    """Build inclusive cumulative array of length len(segments)+1 starting at 0."""
    cum = [0.0]
    running = 0.0
    for value in segment_values:
        running += value
        cum.append(running)
    return cum


def _proportional_duration(cum_dist_mi: list[float], duration_s: float) -> list[float]:
    """Fallback ETA cumulative seconds proportional to scaled distance (D7)."""
    if not cum_dist_mi:
        return []
    total = cum_dist_mi[-1]
    if total <= 0:
        return [0.0 for _ in cum_dist_mi]
    return scale_to_total([duration_s * (d / total) for d in cum_dist_mi], duration_s)


def parse_route(raw: dict[str, Any]) -> RouteData:
    """
    Parse one Mapbox route object into RouteData with scaled cumulatives.

    Uses annotation.duration when its length equals len(coords)-1 (concatenated
    across legs); otherwise falls back to proportional-to-distance.
    """
    geometry = raw.get("geometry") or {}
    coords = _coords_from_geojson(geometry.get("coordinates") or [])
    if len(coords) < 2:
        raise UpstreamBadGatewayError(
            "Route geometry is too short.",
            details={"coords": len(coords)},
        )

    distance_mi = _meters_to_mi(float(raw["distance"]))
    duration_s = float(raw["duration"])
    legs = list(raw.get("legs") or [])

    haversine_cum = cumulative_distance_mi(coords)
    cum_dist_mi = scale_to_total(haversine_cum, distance_mi)

    duration_segments = _concat_leg_annotations(legs, "duration")
    if len(duration_segments) == len(coords) - 1:
        cum_dur_s = scale_to_total(_cumulative_from_segments(duration_segments), duration_s)
    else:
        cum_dur_s = _proportional_duration(cum_dist_mi, duration_s)

    return RouteData(
        id="tmp",
        label="tmp",
        coords=coords,
        cum_dist_mi=cum_dist_mi,
        cum_dur_s=cum_dur_s,
        distance_mi=distance_mi,
        duration_s=duration_s,
    )


def _map_http_error(response: requests.Response) -> None:
    if response.status_code == 429:
        raise UpstreamRateLimitError()
    if response.status_code >= 500:
        raise UpstreamBadGatewayError(
            "Upstream directions service error.",
            details={"status": response.status_code},
        )


def _request_directions(
    session: requests.Session,
    token: str,
    waypoints: list[LatLng],
    *,
    exclude: str | None = None,
) -> dict[str, Any]:
    """Call Mapbox Directions v5; coordinates are lng,lat pairs."""
    coord_path = ";".join(f"{point.lng},{point.lat}" for point in waypoints)
    url = DIRECTIONS_URL.format(coordinates=coord_path)
    params: dict[str, Any] = {
        "access_token": token,
        "alternatives": "true",
        "geometries": "geojson",
        "overview": "full",
        "annotations": "distance,duration",
        "steps": "false",
    }
    if exclude:
        params["exclude"] = exclude
    try:
        response = session.get(url, params=params, timeout=REQUEST_TIMEOUT_S)
    except requests.Timeout as exc:
        raise UpstreamTimeoutError() from exc
    except requests.RequestException as exc:
        raise UpstreamBadGatewayError("Directions request failed.") from exc

    _map_http_error(response)
    try:
        payload = response.json()
    except ValueError as exc:
        raise UpstreamBadGatewayError("Invalid JSON from directions API.") from exc

    code = str(payload.get("code", ""))
    if code == "NoRoute" or response.status_code == 404:
        raise NoRouteError(details=payload.get("message"))
    if code and code != "Ok":
        if response.status_code >= 400:
            _map_http_error(response)
        raise UpstreamBadGatewayError(
            f"Directions API returned code {code}.",
            details=payload.get("message"),
        )
    return payload


def _routes_from_payload(payload: dict[str, Any]) -> list[RouteData]:
    return [parse_route(raw) for raw in payload.get("routes") or []]


def _finalize(accepted: list[RouteData]) -> RoutesResult:
    ordered = sorted(accepted, key=lambda route: route.duration_s)
    labels = ("Fastest", "Alternative A", "Alternative B")
    routes: list[RouteData] = []
    for index, route in enumerate(ordered[:3]):
        routes.append(
            RouteData(
                id=f"r{index + 1}",
                label=labels[index],
                coords=route.coords,
                cum_dist_mi=route.cum_dist_mi,
                cum_dur_s=route.cum_dur_s,
                distance_mi=route.distance_mi,
                duration_s=route.duration_s,
            )
        )
    notice = None
    if len(routes) == 1:
        notice = "Only 1 distinct route exists for this trip."
    elif len(routes) == 2:
        notice = "Only 2 distinct routes exist for this trip."
    return RoutesResult(routes=routes, notice=notice)


def fetch_routes(
    origin: LatLng,
    destination: LatLng,
    *,
    token: str,
    session: requests.Session | None = None,
) -> RoutesResult:
    """
    Fetch up to three distinct driving routes between origin and destination.

    Fallbacks: exclude=toll, then perpendicular via-point routes (D11).
    """
    if haversine_mi(origin, destination) < 1.0:
        from core.errors import ValidationAppError

        raise ValidationAppError("Origin and destination must be at least 1 mile apart.")

    http = session or requests.Session()
    accepted: list[RouteData] = []

    def consider(batch: list[RouteData]) -> None:
        nonlocal accepted
        if not batch:
            return
        ordered = sorted(batch, key=lambda route: route.duration_s)
        fastest = (
            min(accepted, key=lambda route: route.duration_s).duration_s
            if accepted
            else ordered[0].duration_s
        )
        for route in ordered:
            if not accepted:
                accepted.append(route)
                fastest = route.duration_s
                continue
            fastest = min(fastest, min(item.duration_s for item in accepted))
            if is_distinct(route, accepted, fastest):
                accepted.append(route)
            if len(accepted) >= 3:
                return

    primary = _request_directions(http, token, [origin, destination])
    consider(_routes_from_payload(primary))
    if len(accepted) >= 3:
        return _finalize(accepted)

    toll = _request_directions(http, token, [origin, destination], exclude="toll")
    consider(_routes_from_payload(toll))
    if len(accepted) >= 3:
        return _finalize(accepted)

    if accepted:
        fastest_route = min(accepted, key=lambda route: route.duration_s)
        for via in via_offset_points(fastest_route):
            try:
                payload = _request_directions(http, token, [origin, via, destination])
            except NoRouteError:
                continue
            consider(_routes_from_payload(payload))
            if len(accepted) >= 3:
                return _finalize(accepted)

    if not accepted:
        raise NoRouteError()
    return _finalize(accepted)


def route_to_api_dict(route: RouteData) -> dict[str, Any]:
    """Serialize RouteData for POST /api/routes (GeoJSON geometry)."""
    return {
        "id": route.id,
        "label": route.label,
        "distance_mi": route.distance_mi,
        "duration_s": route.duration_s,
        "geometry": display_geometry(route.coords),
    }
