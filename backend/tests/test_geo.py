"""Golden geometry tests for core.geo (D7, D20)."""

from __future__ import annotations

import pytest

from core.geo import (
    LatLng,
    cumulative_distance_mi,
    display_geometry,
    haversine_mi,
    interpolate_along,
    scale_to_total,
)


def test_haversine_one_degree_latitude() -> None:
    """1° of latitude is about 69.09 mi."""
    miles = haversine_mi(LatLng(0.0, 0.0), LatLng(1.0, 0.0))
    assert abs(miles - 69.09) <= 0.05


def test_haversine_one_degree_longitude_equator() -> None:
    """1° of longitude on the equator is about 69.09 mi."""
    miles = haversine_mi(LatLng(0.0, 0.0), LatLng(0.0, 1.0))
    assert abs(miles - 69.09) <= 0.05


def test_latlng_swap_fails_loudly() -> None:
    """Passing longitude into lat must fail range validation."""
    with pytest.raises(ValueError, match="lat out of range"):
        LatLng(lat=120.0, lng=40.0)


def test_latlng_rejects_nan() -> None:
    with pytest.raises(ValueError):
        LatLng(lat=float("nan"), lng=0.0)


def test_scale_to_total_matches_api_distance() -> None:
    coords = [LatLng(0.0, 0.0), LatLng(1.0, 0.0), LatLng(2.0, 0.0)]
    cum = cumulative_distance_mi(coords)
    scaled = scale_to_total(cum, 100.0)
    assert scaled[0] == 0.0
    assert abs(scaled[-1] - 100.0) < 1e-9
    assert scaled == sorted(scaled)


def test_interpolate_midpoint() -> None:
    coords = [LatLng(0.0, 0.0), LatLng(0.0, 1.0)]
    cum = scale_to_total(cumulative_distance_mi(coords), 10.0)
    mid = interpolate_along(coords, cum, 5.0)
    assert abs(mid.lat - 0.0) < 1e-9
    assert abs(mid.lng - 0.5) < 1e-9


def test_display_geometry_respects_cap_and_endpoints() -> None:
    coords = [LatLng(lat=40.0 + i * 0.001, lng=-90.0 + i * 0.001) for i in range(5000)]
    geom = display_geometry(coords, max_points=400)
    assert geom["type"] == "LineString"
    assert len(geom["coordinates"]) <= 400
    assert geom["coordinates"][0] == [coords[0].lng, coords[0].lat]
    assert geom["coordinates"][-1] == [coords[-1].lng, coords[-1].lat]
