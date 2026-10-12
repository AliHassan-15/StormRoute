"""
Geospatial helpers for StormRoute (D7, D20).

Distances use haversine over full-resolution route geometry, scaled so totals
equal the routing API-reported distance. Internal points use LatLng(lat, lng);
GeoJSON boundaries use [lng, lat].
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from shapely.geometry import LineString, mapping

EARTH_RADIUS_MI = 3958.7613


@dataclass(frozen=True)
class LatLng:
    """Geographic point with latitude/longitude in decimal degrees (D20)."""

    lat: float
    lng: float

    def __post_init__(self) -> None:
        if isinstance(self.lat, bool) or not isinstance(self.lat, int | float):
            raise ValueError(f"lat must be a finite number, got {self.lat!r}")
        if isinstance(self.lng, bool) or not isinstance(self.lng, int | float):
            raise ValueError(f"lng must be a finite number, got {self.lng!r}")
        lat = float(self.lat)
        lng = float(self.lng)
        if not math.isfinite(lat) or not math.isfinite(lng):
            raise ValueError("lat and lng must be finite")
        if not -90.0 <= lat <= 90.0:
            raise ValueError(f"lat out of range [-90, 90]: {lat}")
        if not -180.0 <= lng <= 180.0:
            raise ValueError(f"lng out of range [-180, 180]: {lng}")
        object.__setattr__(self, "lat", lat)
        object.__setattr__(self, "lng", lng)


def haversine_mi(a: LatLng, b: LatLng) -> float:
    """Great-circle distance between two points in miles."""
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlat = lat2 - lat1
    dlng = math.radians(b.lng - a.lng)
    chord = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_MI * math.asin(min(1.0, math.sqrt(chord)))


def cumulative_distance_mi(coords: list[LatLng]) -> list[float]:
    """
    Cumulative haversine distances along coords in miles.

    Returns a list the same length as coords; first value is always 0.0.
    """
    if not coords:
        return []
    cum = [0.0]
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine_mi(coords[i - 1], coords[i])
        cum.append(total)
    return cum


def scale_to_total(cum: list[float], total_mi: float) -> list[float]:
    """
    Scale cumulative miles so the last value equals total_mi exactly.

    If the unscaled total is 0, returns a linear ramp to total_mi (or zeros).
    """
    if not cum:
        return []
    if total_mi < 0:
        raise ValueError("total_mi must be >= 0")
    raw = cum[-1]
    if raw <= 0:
        if len(cum) == 1:
            return [0.0]
        step = total_mi / (len(cum) - 1)
        return [step * i for i in range(len(cum))]
    scale = total_mi / raw
    scaled = [value * scale for value in cum]
    scaled[-1] = float(total_mi)
    return scaled


def interpolate_along(coords: list[LatLng], cum_mi: list[float], target_mi: float) -> LatLng:
    """
    Linearly interpolate a point at target_mi along the polyline.

    coords and cum_mi must be the same length; cum_mi must be non-decreasing.
    """
    if len(coords) != len(cum_mi):
        raise ValueError("coords and cum_mi must have the same length")
    if not coords:
        raise ValueError("coords must be non-empty")
    if target_mi <= cum_mi[0]:
        return coords[0]
    if target_mi >= cum_mi[-1]:
        return coords[-1]
    for i in range(1, len(cum_mi)):
        if target_mi <= cum_mi[i]:
            span = cum_mi[i] - cum_mi[i - 1]
            t = 0.0 if span <= 0 else (target_mi - cum_mi[i - 1]) / span
            a, b = coords[i - 1], coords[i]
            return LatLng(
                lat=a.lat + (b.lat - a.lat) * t,
                lng=a.lng + (b.lng - a.lng) * t,
            )
    return coords[-1]


def destination_point(origin: LatLng, distance_mi: float, bearing_deg: float) -> LatLng:
    """
    Destination point after traveling distance_mi along bearing_deg from origin.

    Bearing is degrees clockwise from true north. Distance is in miles.
    """
    angular = distance_mi / EARTH_RADIUS_MI
    brng = math.radians(bearing_deg)
    lat1 = math.radians(origin.lat)
    lng1 = math.radians(origin.lng)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular)
        + math.cos(lat1) * math.sin(angular) * math.cos(brng)
    )
    lng2 = lng1 + math.atan2(
        math.sin(brng) * math.sin(angular) * math.cos(lat1),
        math.cos(angular) - math.sin(lat1) * math.sin(lat2),
    )
    lng_deg = (math.degrees(lng2) + 540.0) % 360.0 - 180.0
    return LatLng(lat=math.degrees(lat2), lng=lng_deg)


def initial_bearing_deg(a: LatLng, b: LatLng) -> float:
    """Initial bearing in degrees from a to b (0 = north, clockwise)."""
    lat1, lat2 = math.radians(a.lat), math.radians(b.lat)
    dlng = math.radians(b.lng - a.lng)
    x = math.sin(dlng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def display_geometry(coords: list[LatLng], max_points: int = 4000) -> dict:
    """
    Simplify coords to a GeoJSON LineString [lng, lat] with <= max_points.

    Used ONLY for display. Checkpoints always use full-resolution coordinates.
    Endpoints are preserved.
    """
    if max_points < 2:
        raise ValueError("max_points must be >= 2")
    if len(coords) < 2:
        raise ValueError("coords must contain at least two points")

    raw = [[c.lng, c.lat] for c in coords]
    if len(raw) <= max_points:
        return {"type": "LineString", "coordinates": raw}

    line = LineString(raw)
    tolerance = 1e-6
    simplified = list(raw)
    for _ in range(40):
        geom = line.simplify(tolerance, preserve_topology=True)
        simplified = [list(pair) for pair in mapping(geom)["coordinates"]]
        if len(simplified) <= max_points:
            break
        tolerance *= 2.0

    if len(simplified) > max_points:
        # Uniform downsample as a last resort while keeping endpoints.
        idxs = [
            round(i * (len(simplified) - 1) / (max_points - 1)) for i in range(max_points)
        ]
        simplified = [simplified[i] for i in idxs]

    if simplified[0] != raw[0]:
        simplified[0] = raw[0]
    if simplified[-1] != raw[-1]:
        simplified[-1] = raw[-1]
    return {"type": "LineString", "coordinates": simplified}
