"""Route distinctness helpers: grid overlap and perpendicular via-points (D11)."""

from __future__ import annotations

import math
from typing import Protocol

from core.geo import (
    LatLng,
    destination_point,
    initial_bearing_deg,
    interpolate_along,
)

GRID_DEG = 0.01
SAMPLE_EVERY_MI = 0.5
MAX_DURATION_RATIO = 1.5
OVERLAP_THRESHOLD = 0.85


class RouteLike(Protocol):
    """Minimal route fields needed for overlap / via calculations."""

    coords: list[LatLng]
    cum_dist_mi: list[float]
    distance_mi: float
    duration_s: float


def sample_grid_cells(route: RouteLike, every_mi: float = SAMPLE_EVERY_MI) -> set[tuple[int, int]]:
    """Sample points every every_mi and snap to a GRID_DEG grid."""
    cells: set[tuple[int, int]] = set()
    if route.distance_mi <= 0:
        point = route.coords[0]
        return {(int(math.floor(point.lat / GRID_DEG)), int(math.floor(point.lng / GRID_DEG)))}
    t = 0.0
    while t <= route.distance_mi + 1e-9:
        point = interpolate_along(route.coords, route.cum_dist_mi, min(t, route.distance_mi))
        cells.add((int(math.floor(point.lat / GRID_DEG)), int(math.floor(point.lng / GRID_DEG))))
        t += every_mi
    end = route.coords[-1]
    cells.add((int(math.floor(end.lat / GRID_DEG)), int(math.floor(end.lng / GRID_DEG))))
    return cells


def overlap_ratio(a: RouteLike, b: RouteLike) -> float:
    """Shared grid cells / smaller route cell count (0.5 mi samples, 0.01° grid)."""
    cells_a = sample_grid_cells(a)
    cells_b = sample_grid_cells(b)
    if not cells_a or not cells_b:
        return 0.0
    shared = len(cells_a & cells_b)
    return shared / min(len(cells_a), len(cells_b))


def is_distinct(
    candidate: RouteLike,
    accepted: list[RouteLike],
    fastest_duration_s: float,
) -> bool:
    """True if candidate is under 1.5x fastest and overlaps each accepted by < 85%."""
    if candidate.duration_s > MAX_DURATION_RATIO * fastest_duration_s:
        return False
    return all(overlap_ratio(candidate, existing) < OVERLAP_THRESHOLD for existing in accepted)


def via_offset_points(fastest: RouteLike) -> list[LatLng]:
    """
    Perpendicular via-points at 50% of the fastest route.

    Offset distance is clamp(8% of trip distance, 3 mi, 40 mi).
    """
    mid = interpolate_along(fastest.coords, fastest.cum_dist_mi, fastest.distance_mi * 0.5)
    ahead = interpolate_along(
        fastest.coords,
        fastest.cum_dist_mi,
        min(fastest.distance_mi, fastest.distance_mi * 0.5 + 0.5),
    )
    bearing = initial_bearing_deg(mid, ahead) if ahead != mid else 0.0
    offset_mi = min(40.0, max(3.0, 0.08 * fastest.distance_mi))
    left = destination_point(mid, offset_mi, (bearing - 90.0) % 360.0)
    right = destination_point(mid, offset_mi, (bearing + 90.0) % 360.0)
    return [left, right]
