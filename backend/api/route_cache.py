"""Helpers to rebuild RouteData from the cached /api/routes payload."""

from __future__ import annotations

from core.geo import LatLng, cumulative_distance_mi, scale_to_total
from core.routing_client import RouteData


def routes_cache_key(origin: LatLng, destination: LatLng) -> str:
    """Cache key shared by RoutesView, AnalyzeView, and HeatmapView."""
    return (
        "routes:v1:"
        f"{origin.lat:.4f},{origin.lng:.4f}:"
        f"{destination.lat:.4f},{destination.lng:.4f}"
    )


def route_data_from_cached_payload(payload: dict) -> list[RouteData]:
    """Rebuild RouteData from a cached /api/routes payload (display geometry)."""
    routes: list[RouteData] = []
    for index, item in enumerate(payload.get("routes") or []):
        coords_raw = (item.get("geometry") or {}).get("coordinates") or []
        coords = [
            LatLng(lat=float(pair[1]), lng=float(pair[0])) for pair in coords_raw
        ]
        if len(coords) < 2:
            continue
        distance_mi = float(item.get("distance_mi") or 0.0)
        duration_s = float(item.get("duration_s") or 0.0)
        cum = scale_to_total(cumulative_distance_mi(coords), distance_mi)
        if distance_mi > 0:
            cum_dur = [duration_s * (d / distance_mi) for d in cum]
        else:
            cum_dur = [0.0 for _ in cum]
        routes.append(
            RouteData(
                id=str(item.get("id") or f"R{index}"),
                label=str(item.get("label") or f"Route {index + 1}"),
                coords=coords,
                cum_dist_mi=cum,
                cum_dur_s=cum_dur,
                distance_mi=distance_mi,
                duration_s=duration_s,
            )
        )
    return routes
