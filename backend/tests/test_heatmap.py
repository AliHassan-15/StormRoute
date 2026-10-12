"""Corridor heatmap core tests (D12, D15) — golden values from Phase 9."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from core.geo import LatLng, cumulative_distance_mi, destination_point, scale_to_total
from core.heatmap import (
    FRAME_COUNT,
    LATERAL_OFFSET_MI,
    MAX_POINTS,
    MI_PER_DEG_LNG_EQUATOR,
    build_corridor_grid,
    build_heatmap,
    corridor_points_for_route,
    frame_datetimes,
    round_departure_to_t0,
    serialized_size_bytes,
    spacing_mi,
)
from core.risk import Weather, assess
from core.routing_client import RouteData
from core.weather_client import WeatherSeries


def _meridian_route(distance_mi: float = 100.0) -> RouteData:
    """Straight northbound route on lng=0 starting at the equator."""
    end = destination_point(LatLng(0.0, 0.0), distance_mi, 0.0)
    # Dense enough vertices for local bearing + interpolation.
    n = max(20, int(distance_mi) + 1)
    coords = [
        destination_point(LatLng(0.0, 0.0), distance_mi * i / (n - 1), 0.0)
        for i in range(n)
    ]
    coords[0] = LatLng(0.0, 0.0)
    coords[-1] = end
    cum = scale_to_total(cumulative_distance_mi(coords), distance_mi)
    return RouteData(
        id="m1",
        label="Meridian",
        coords=coords,
        cum_dist_mi=cum,
        cum_dur_s=[0.0] * len(coords),
        distance_mi=distance_mi,
        duration_s=3600.0,
    )


def test_spacing_clamp() -> None:
    assert spacing_mi(100.0) == 10.0
    assert spacing_mi(600.0) == 10.0
    assert spacing_mi(3000.0) == 50.0
    assert spacing_mi(1800.0) == 30.0


def test_meridian_corridor_lateral_and_count() -> None:
    route = _meridian_route(100.0)
    s = spacing_mi(route.distance_mi)
    assert s == 10.0
    points = corridor_points_for_route(route, s)
    # 11 along-route samples × 3 (left, center, right) = 33 before dedupe.
    assert len(points) == 33

    # Group by mile index: every 3 points are left, center, right.
    centers = points[1::3]
    assert len(centers) == 11
    for center in centers:
        assert abs(center.lng) < 0.02

    lefts = points[0::3]
    rights = points[2::3]
    expected = LATERAL_OFFSET_MI / MI_PER_DEG_LNG_EQUATOR
    for left, right in zip(lefts, rights, strict=True):
        assert abs(left.lng - (-expected)) <= 0.01
        assert abs(right.lng - expected) <= 0.01


def test_corridor_cap_5000_mi() -> None:
    route = _meridian_route(5000.0)
    grid = build_corridor_grid([route])
    assert len(grid) <= MAX_POINTS


def test_t0_rounding_and_frames() -> None:
    down = round_departure_to_t0(datetime(2026, 10, 12, 12, 29, tzinfo=UTC))
    assert down == datetime(2026, 10, 12, 12, 0, tzinfo=UTC)

    up = round_departure_to_t0(datetime(2026, 10, 12, 12, 30, tzinfo=UTC))
    assert up == datetime(2026, 10, 12, 13, 0, tzinfo=UTC)

    frames = frame_datetimes(up)
    assert len(frames) == FRAME_COUNT
    assert frames[0] == up
    assert frames[-1] == up + timedelta(hours=48)
    for i in range(1, len(frames)):
        assert frames[i] - frames[i - 1] == timedelta(hours=1)


def test_wind_47_risk_by_load() -> None:
    weather = Weather(wind_mph=47.0, rain_in_hr=0.0, snow_in_hr=0.0)
    assert assess(weather, load_lb=35_000).final_level == 5
    assert assess(weather, load_lb=20_000).final_level == 4


def test_null_stays_null_and_payload_size() -> None:
    route = _meridian_route(100.0)
    t0 = datetime(2026, 10, 12, 12, 0, tzinfo=UTC)
    frames = frame_datetimes(t0)
    # One hour missing (None), rest filled.
    wind = [10.0] * FRAME_COUNT
    wind[5] = None  # type: ignore[assignment]
    rain = [0.0] * FRAME_COUNT
    snow = [0.0] * FRAME_COUNT
    series = WeatherSeries(
        times_utc=tuple(frames),
        wind_mph=tuple(wind),
        gust_mph=tuple([None] * FRAME_COUNT),
        rain_in_hr=tuple(rain),
        snow_in_hr=tuple(snow),
    )

    def fake_fetch(points, start_date, end_date, session=None, max_workers=4):
        return {(p.lat, p.lng): series for p in points}

    with patch("core.heatmap.fetch_hourly", side_effect=fake_fetch):
        payload = build_heatmap(
            [route],
            datetime(2026, 10, 12, 12, 29, tzinfo=UTC),
            load_lb=20_000,
        )

    assert payload["frame_count"] == 49
    assert payload["t0_utc"] == "2026-10-12T12:00:00Z"
    assert payload["points"]
    sample = payload["points"][0]
    assert sample["wind"][5] is None
    assert sample["rain"][5] is None
    assert sample["snow"][5] is None
    assert sample["risk"][5] is None
    assert sample["wind"][0] == 10.0
    assert isinstance(sample["risk"][0], int)

    # Inflate to 300 points for size check.
    big_points = []
    for i in range(300):
        big_points.append(
            {
                "lat": round(i * 0.05, 2),
                "lng": 0.0,
                "wind": sample["wind"],
                "rain": sample["rain"],
                "snow": sample["snow"],
                "risk": sample["risk"],
            }
        )
    big = {
        "t0_utc": payload["t0_utc"],
        "frame_count": 49,
        "points": big_points,
        "notices": [],
    }
    assert serialized_size_bytes(big) < 600_000


def test_build_heatmap_risk_levels_match_assess() -> None:
    route = _meridian_route(100.0)
    frames = frame_datetimes(datetime(2026, 10, 12, 13, 0, tzinfo=UTC))
    series = WeatherSeries(
        times_utc=tuple(frames),
        wind_mph=tuple([47.0] * FRAME_COUNT),
        gust_mph=tuple([None] * FRAME_COUNT),
        rain_in_hr=tuple([0.0] * FRAME_COUNT),
        snow_in_hr=tuple([0.0] * FRAME_COUNT),
    )

    def fake_fetch(points, start_date, end_date, session=None, max_workers=4):
        return {(p.lat, p.lng): series for p in points}

    with patch("core.heatmap.fetch_hourly", side_effect=fake_fetch):
        heavy = build_heatmap(
            [route],
            datetime(2026, 10, 12, 12, 30, tzinfo=UTC),
            load_lb=35_000,
        )
        light = build_heatmap(
            [route],
            datetime(2026, 10, 12, 12, 30, tzinfo=UTC),
            load_lb=20_000,
        )

    assert heavy["points"][0]["risk"][0] == 5
    assert light["points"][0]["risk"][0] == 4
