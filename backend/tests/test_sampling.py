"""Checkpoint sampling, ETA, coverage, and local-time tests (D6–D8, D13)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from core.geo import LatLng, cumulative_distance_mi, scale_to_total
from core.routing_client import RouteData
from core.sampling import (
    auto_interval,
    build_checkpoints,
    coverage,
    duration_at_mile,
    local_time_for,
    resolve_timezone_name,
)


def _meridian_route(total_mi: float = 69.1) -> RouteData:
    coords = [LatLng(lat=i / 10.0, lng=0.0) for i in range(11)]
    cum = scale_to_total(cumulative_distance_mi(coords), total_mi)
    # Proportional duration is fine for sampling geometry tests.
    duration_s = 6900.0
    cum_dur = [duration_s * (d / total_mi) for d in cum]
    return RouteData(
        id="t",
        label="t",
        coords=coords,
        cum_dist_mi=cum,
        cum_dur_s=cum_dur,
        distance_mi=total_mi,
        duration_s=duration_s,
    )


def test_interval_25_on_69_1_mi() -> None:
    plan = build_checkpoints(
        _meridian_route(69.1),
        25,
        datetime(2026, 10, 14, 12, 0, tzinfo=UTC),
    )
    miles = [cp.mile for cp in plan.checkpoints]
    assert miles == pytest.approx([0, 25, 50, 69.1], abs=1e-9)
    assert len(plan.checkpoints) == 4
    assert abs(plan.checkpoints[1].lat - (25 / 69.1)) <= 0.001


def test_interval_10_on_69_1_mi() -> None:
    plan = build_checkpoints(
        _meridian_route(69.1),
        10,
        datetime(2026, 10, 14, 12, 0, tzinfo=UTC),
    )
    assert [cp.mile for cp in plan.checkpoints] == pytest.approx(
        [0, 10, 20, 30, 40, 50, 60, 69.1],
        abs=1e-9,
    )
    assert len(plan.checkpoints) == 8


def test_drop_last_regular_when_near_destination() -> None:
    plan = build_checkpoints(
        _meridian_route(51.0),
        25,
        datetime(2026, 10, 14, 12, 0, tzinfo=UTC),
    )
    assert [cp.mile for cp in plan.checkpoints] == pytest.approx([0, 25, 51], abs=1e-9)


def test_keep_50_when_far_enough_from_destination() -> None:
    plan = build_checkpoints(
        _meridian_route(61.0),
        25,
        datetime(2026, 10, 14, 12, 0, tzinfo=UTC),
    )
    assert [cp.mile for cp in plan.checkpoints] == pytest.approx([0, 25, 50, 61], abs=1e-9)
    assert len(plan.checkpoints) == 4


def test_auto_interval_boundaries() -> None:
    assert auto_interval(150) == 10
    assert auto_interval(150.01) == 25
    assert auto_interval(500) == 25
    assert auto_interval(500.01) == 50


def test_interval_raised_for_3000_mi_route() -> None:
    coords = [LatLng(lat=0.0, lng=0.0), LatLng(lat=40.0, lng=0.0)]
    cum = scale_to_total(cumulative_distance_mi(coords), 3000.0)
    route = RouteData(
        id="t",
        label="t",
        coords=coords,
        cum_dist_mi=cum,
        cum_dur_s=[0.0, 100000.0],
        distance_mi=3000.0,
        duration_s=100000.0,
    )
    plan = build_checkpoints(route, 10, datetime(2026, 10, 14, 12, 0, tzinfo=UTC))
    assert plan.interval_used > 10
    assert len(plan.checkpoints) <= 150
    assert plan.notice is not None
    assert "raised" in plan.notice.lower()


def test_eta_uses_per_segment_durations_not_average_speed() -> None:
    route = RouteData(
        id="t",
        label="t",
        coords=[LatLng(0.0, 0.0), LatLng(0.5, 0.0), LatLng(1.0, 0.0)],
        cum_dist_mi=[0.0, 50.0, 100.0],
        cum_dur_s=[0.0, 3600.0, 10800.0],
        distance_mi=100.0,
        duration_s=10800.0,
    )
    departure = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
    plan = build_checkpoints(route, 25, departure)
    by_mile = {round(cp.mile, 1): cp for cp in plan.checkpoints}

    assert by_mile[25.0].eta_utc == datetime(2026, 10, 14, 12, 30, tzinfo=UTC)
    assert by_mile[50.0].eta_utc == datetime(2026, 10, 14, 13, 0, tzinfo=UTC)
    assert by_mile[75.0].eta_utc == datetime(2026, 10, 14, 14, 0, tzinfo=UTC)
    assert by_mile[100.0].eta_utc == datetime(2026, 10, 14, 15, 0, tzinfo=UTC)

    # Flat average speed would put mile 50 at 13:30Z — prove we did not do that.
    assert duration_at_mile(route, 50.0) == 3600.0


def test_coverage_sums_to_total() -> None:
    plan = build_checkpoints(
        _meridian_route(69.1),
        25,
        datetime(2026, 10, 14, 12, 0, tzinfo=UTC),
    )
    spans = coverage(plan.checkpoints, 69.1)
    assert abs(sum(b - a for a, b in spans) - 69.1) < 1e-9
    assert spans[0][0] == 0.0
    assert spans[-1][1] == pytest.approx(69.1)


def test_denver_local_offset() -> None:
    eta = datetime(2026, 10, 14, 18, 0, tzinfo=UTC)
    iso, name = local_time_for(39.7392, -104.9903, eta)
    assert name == "America/Denver"
    assert iso.endswith("-06:00") or iso.endswith("-07:00")


def test_mid_ocean_falls_back_to_utc() -> None:
    assert resolve_timezone_name(0.0, -40.0) == "UTC"
    eta = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)
    iso, name = local_time_for(0.0, -40.0, eta)
    assert name == "UTC"
    assert iso.endswith("+00:00") or iso.endswith("Z")
