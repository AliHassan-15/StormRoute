"""Hand-computed scoring / ranking goldens (D8–D10). Authoritative."""

from __future__ import annotations

import pytest

from core.risk import RiskLevel
from core.scoring import (
    CheckpointLevel,
    build_explanation,
    rank_routes,
    score_route,
)

L = RiskLevel.LOW
M = RiskLevel.MODERATE
H = RiskLevel.HIGH
S = RiskLevel.SEVERE
N = RiskLevel.NO_TRAVEL

# Interval 25 on 100 mi -> coverage 12.5, 25, 25, 25, 12.5
COVER = [
    (0.0, 12.5),
    (12.5, 37.5),
    (37.5, 62.5),
    (62.5, 87.5),
    (87.5, 100.0),
]
MILES = [0.0, 25.0, 50.0, 75.0, 100.0]


def _levels(levels: list[RiskLevel | None]) -> list[CheckpointLevel]:
    return [
        CheckpointLevel(
            level=level,
            coverage_from_mi=COVER[i][0],
            coverage_to_mi=COVER[i][1],
            mile=MILES[i],
        )
        for i, level in enumerate(levels)
    ]


def _assert_miles_sum(metrics, total_mi: float = 100.0) -> None:
    total = sum(metrics.miles_by_level.values())
    assert abs(total - total_mi) <= 0.01


def test_scenario_1_priority_order() -> None:
    a = score_route(_levels([L, M, S, H, L]), 100.0, 120 * 60)
    b = score_route(_levels([L, H, H, M, L]), 100.0, 115 * 60)
    c = score_route(_levels([L, L, M, M, L]), 100.0, 140 * 60)

    for metrics in (a, b, c):
        _assert_miles_sum(metrics)

    assert a.miles_by_level["LOW"] == 25
    assert a.miles_by_level["MODERATE"] == 25
    assert a.miles_by_level["SEVERE"] == 25
    assert a.miles_by_level["HIGH"] == 25
    assert a.avg_risk == 2.50

    assert b.miles_by_level["LOW"] == 25
    assert b.miles_by_level["HIGH"] == 50
    assert b.miles_by_level["MODERATE"] == 25
    assert b.severe_miles == 0
    assert b.avg_risk == 2.25

    assert c.miles_by_level["LOW"] == 50
    assert c.miles_by_level["MODERATE"] == 50
    assert c.severe_miles == 0
    assert c.high_miles == 0
    assert c.avg_risk == 1.50

    ranked = rank_routes(
        [
            ("A", "Route A", a, 120 * 60, 100.0, ()),
            ("B", "Route B", b, 115 * 60, 100.0, ()),
            ("C", "Route C", c, 140 * 60, 100.0, ()),
        ]
    )
    assert [r.id for r in ranked] == ["C", "B", "A"]
    assert ranked[0].is_recommended
    assert ranked[0].delay_vs_fastest_s == 25 * 60

    rec_id, explanation, all_blocked = build_explanation(ranked)
    assert rec_id == "C"
    assert all_blocked is False
    assert "Route C" in explanation or "C" in explanation
    assert "0 Severe" in explanation
    assert "0 High" in explanation
    assert "25 minutes slower" in explanation
    assert "B" in explanation


def test_scenario_2_tie_breaks_on_duration() -> None:
    levels = _levels([L, L, M, L, L])
    fast = score_route(levels, 100.0, 90 * 60)
    slow = score_route(levels, 100.0, 100 * 60)
    ranked = rank_routes(
        [
            ("slow", "Slow", slow, 100 * 60, 100.0, ()),
            ("fast", "Fast", fast, 90 * 60, 100.0, ()),
        ]
    )
    assert [r.id for r in ranked] == ["fast", "slow"]


def test_scenario_3_blocked_ranks_below_unblocked() -> None:
    blocked = score_route(_levels([L, N, L, L, L]), 100.0, 80 * 60)
    safe = score_route(_levels([L, L, L, L, L]), 100.0, 100 * 60)
    assert blocked.is_blocked
    ranked = rank_routes(
        [
            ("D", "Blocked Fast", blocked, 80 * 60, 100.0, (25.0,)),
            ("E", "Safe Slow", safe, 100 * 60, 100.0, ()),
        ]
    )
    assert ranked[0].id == "E"
    assert ranked[1].id == "D"
    assert ranked[1].metrics.is_blocked


def test_scenario_4_all_blocked() -> None:
    d = score_route(_levels([N, L, L, L, L]), 100.0, 80 * 60)
    e = score_route(_levels([L, N, L, L, L]), 100.0, 90 * 60)
    ranked = rank_routes(
        [
            ("D", "Route D", d, 80 * 60, 100.0, (0.0,)),
            ("E", "Route E", e, 90 * 60, 100.0, (25.0,)),
        ]
    )
    rec_id, explanation, all_blocked = build_explanation(ranked)
    assert rec_id is None
    assert all_blocked is True
    assert "Every route has No Travel" in explanation
    assert "Route D" in explanation and "Route E" in explanation


def test_scenario_5_rounding_tie_on_severe() -> None:
    # Fabricate metrics via CheckpointLevel with unequal coverage to hit 12.4 / 12.0
    g_levels = [
        CheckpointLevel(S, 0.0, 12.4, 0.0),
        CheckpointLevel(H, 12.4, 17.4, 20.0),
        CheckpointLevel(L, 17.4, 100.0, 100.0),
    ]
    h_levels = [
        CheckpointLevel(S, 0.0, 12.0, 0.0),
        CheckpointLevel(H, 12.0, 32.0, 20.0),
        CheckpointLevel(L, 32.0, 100.0, 100.0),
    ]
    g = score_route(g_levels, 100.0, 100 * 60)
    h = score_route(h_levels, 100.0, 100 * 60)
    assert abs(g.severe_miles - 12.4) < 1e-9
    assert abs(h.severe_miles - 12.0) < 1e-9
    assert abs(g.high_miles - 5.0) < 1e-9
    assert abs(h.high_miles - 20.0) < 1e-9
    _assert_miles_sum(g)
    _assert_miles_sum(h)

    ranked = rank_routes(
        [
            ("H", "Route H", h, 100 * 60, 100.0, ()),
            ("G", "Route G", g, 100 * 60, 100.0, ()),
        ]
    )
    assert ranked[0].id == "G"


def test_scenario_6_unknown_weather_avg_over_known() -> None:
    metrics = score_route(_levels([L, None, H, L, L]), 100.0, 100 * 60)
    _assert_miles_sum(metrics)
    assert metrics.miles_by_level["LOW"] == 50
    assert metrics.miles_by_level["UNKNOWN"] == 25
    assert metrics.miles_by_level["HIGH"] == 25
    # (50*1 + 25*3) / 75 = 1.666...; API rounds avg_risk to 1.67
    assert metrics.avg_risk == pytest.approx(1.6666666667)
    assert round(metrics.avg_risk, 2) == 1.67
