"""
Route risk aggregation and recommendation ranking (D8–D10).

Average risk is the distance-weighted mean of level numbers excluding unknown
checkpoints (D9). Ranking key ascending: (has_no_travel, no_travel_miles,
severe_miles, high_miles, avg_risk, duration) with documented rounding (D10).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from core.risk import RiskLevel

LEVEL_KEYS = ("LOW", "MODERATE", "HIGH", "SEVERE", "NO_TRAVEL", "UNKNOWN")


@dataclass(frozen=True)
class CheckpointLevel:
    """One checkpoint's final level for scoring (None = unknown weather)."""

    level: RiskLevel | None
    coverage_from_mi: float
    coverage_to_mi: float
    mile: float = 0.0


@dataclass(frozen=True)
class RouteMetrics:
    """Distance-weighted risk metrics for one route (D8, D9)."""

    miles_by_level: dict[str, float]
    severe_miles: float
    high_miles: float
    no_travel_miles: float
    avg_risk: float | None
    worst_level: RiskLevel | None
    is_blocked: bool


@dataclass(frozen=True)
class RankedRoute:
    """A scored route after stable ranking (D10)."""

    id: str
    label: str
    metrics: RouteMetrics
    duration_s: float
    total_mi: float
    rank: int
    delay_vs_fastest_s: float
    is_recommended: bool
    no_travel_miles_at: tuple[float, ...]


def _coverage_mi(span: CheckpointLevel) -> float:
    return max(0.0, span.coverage_to_mi - span.coverage_from_mi)


def score_route(
    checkpoints_with_levels: Sequence[CheckpointLevel],
    total_mi: float,
    duration_s: float,
) -> RouteMetrics:
    """
    Aggregate checkpoint levels into route metrics (D8, D9).

    Miles by level use coverage spans and must sum to total_mi. avg_risk is the
    distance-weighted mean of known level numbers (LOW=1 … NO_TRAVEL=5), or
    null when every mile is unknown. duration_s is accepted for API symmetry
    and not used in the aggregation itself.
    """
    del duration_s  # duration is attached by callers / ranking, not scoring
    miles: dict[str, float] = {key: 0.0 for key in LEVEL_KEYS}
    known_weight = 0.0
    known_sum = 0.0
    worst: RiskLevel | None = None

    for item in checkpoints_with_levels:
        weight = _coverage_mi(item)
        if item.level is None:
            miles["UNKNOWN"] += weight
            continue
        miles[item.level.name] += weight
        known_weight += weight
        known_sum += weight * int(item.level)
        if worst is None or item.level > worst:
            worst = item.level

    covered = sum(miles.values())
    if checkpoints_with_levels and abs(covered - total_mi) > 1e-9:
        # Absorb float drift into the last non-zero bucket (prefer UNKNOWN/LOW).
        drift = total_mi - covered
        for key in ("UNKNOWN", "LOW", "MODERATE", "HIGH", "SEVERE", "NO_TRAVEL"):
            if miles[key] > 0 or key == "LOW":
                miles[key] += drift
                break

    avg_risk: float | None
    if known_weight <= 0:
        avg_risk = None
    else:
        avg_risk = known_sum / known_weight

    return RouteMetrics(
        miles_by_level=miles,
        severe_miles=miles["SEVERE"],
        high_miles=miles["HIGH"],
        no_travel_miles=miles["NO_TRAVEL"],
        avg_risk=avg_risk,
        worst_level=worst,
        is_blocked=miles["NO_TRAVEL"] > 0,
    )


def _round_miles(value: float) -> int:
    """Nearest 1 mile for ranking comparisons (D10)."""
    return int(round(value))


def _round_avg_risk(value: float | None) -> float:
    """Nearest 0.01 for ranking; missing avg_risk sorts last among ties."""
    if value is None or not math.isfinite(value):
        return 999.0
    return round(value, 2)


def _round_duration_min(duration_s: float) -> int:
    """Nearest whole minute for ranking (D10)."""
    return int(round(duration_s / 60.0))


def ranking_key(
    metrics: RouteMetrics,
    duration_s: float,
    route_id: str,
) -> tuple:
    """
    Ascending sort key (D10).

    (has_no_travel, no_travel_miles, severe_miles, high_miles, avg_risk,
    duration_min, route_id). Miles rounded to 1 mi; avg_risk to 2 decimals;
    duration to nearest minute. Final tie -> route id.
    """
    return (
        1 if metrics.is_blocked else 0,
        _round_miles(metrics.no_travel_miles),
        _round_miles(metrics.severe_miles),
        _round_miles(metrics.high_miles),
        _round_avg_risk(metrics.avg_risk),
        _round_duration_min(duration_s),
        route_id,
    )


def rank_routes(
    routes: Sequence[tuple[str, str, RouteMetrics, float, float, Sequence[float]]],
) -> list[RankedRoute]:
    """
    Rank scored routes deterministically (D10).

    Each item is (id, label, metrics, duration_s, total_mi, no_travel_miles_at).
    Blocked routes rank below every unblocked route. Stable via route id.
    """
    if not routes:
        return []

    fastest_s = min(item[3] for item in routes)
    sorted_items = sorted(
        routes,
        key=lambda item: ranking_key(item[2], item[3], item[0]),
    )
    all_blocked = all(item[2].is_blocked for item in sorted_items)

    ranked: list[RankedRoute] = []
    for index, (route_id, label, metrics, duration_s, total_mi, nt_at) in enumerate(
        sorted_items
    ):
        rank = index + 1
        ranked.append(
            RankedRoute(
                id=route_id,
                label=label,
                metrics=metrics,
                duration_s=duration_s,
                total_mi=total_mi,
                rank=rank,
                delay_vs_fastest_s=duration_s - fastest_s,
                is_recommended=(not all_blocked and rank == 1),
                no_travel_miles_at=tuple(nt_at),
            )
        )
    return ranked


def _fmt_miles(value: float) -> str:
    rounded = round(value, 1)
    if abs(rounded - round(rounded)) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:.1f}"


def _fmt_minutes(duration_s: float) -> str:
    minutes = int(round(duration_s / 60.0))
    return f"{minutes} minute{'s' if minutes != 1 else ''}"


def build_explanation(ranked: Sequence[RankedRoute]) -> tuple[str | None, str, bool]:
    """
    Build plain-English recommendation text (D10).

    Returns (route_id|None, explanation, all_blocked). Always states the time
    cost versus the fastest route. All-blocked -> null recommendation with a
    message covering every route's No Travel conditions and worst checkpoint.
    """
    if not ranked:
        return None, "No routes available to recommend.", False

    all_blocked = all(route.metrics.is_blocked for route in ranked)
    fastest = min(ranked, key=lambda route: route.duration_s)

    if all_blocked:
        parts = [
            "Every route has No Travel conditions at this departure time, "
            "so no route is recommended."
        ]
        for route in ranked:
            where = (
                ", ".join(f"mile {_fmt_miles(m)}" for m in route.no_travel_miles_at)
                if route.no_travel_miles_at
                else "one or more checkpoints"
            )
            worst = (
                route.metrics.worst_level.label
                if route.metrics.worst_level is not None
                else "unknown"
            )
            parts.append(
                f"{route.label} ({route.id}): No Travel at {where} "
                f"(worst level {worst})."
            )
        parts.append(
            f"The fastest option by time would be {fastest.label} "
            f"({_fmt_minutes(fastest.duration_s)})."
        )
        return None, " ".join(parts), True

    winner = next(route for route in ranked if route.is_recommended)
    others = [route for route in ranked if route.id != winner.id]
    next_best = others[0] if others else None

    chunks: list[str] = [
        f"Recommended {winner.label} ({winner.id}) with "
        f"{_fmt_miles(winner.metrics.severe_miles)} Severe and "
        f"{_fmt_miles(winner.metrics.high_miles)} High miles."
    ]
    if next_best is not None:
        chunks.append(
            f"Compared with {next_best.label}, this is "
            f"{_fmt_miles(winner.metrics.severe_miles)} vs "
            f"{_fmt_miles(next_best.metrics.severe_miles)} Severe miles and "
            f"{_fmt_miles(winner.metrics.high_miles)} vs "
            f"{_fmt_miles(next_best.metrics.high_miles)} High miles."
        )

    if abs(winner.delay_vs_fastest_s) < 30:
        chunks.append(
            f"It matches the fastest route time "
            f"({_fmt_minutes(winner.duration_s)})."
        )
    elif winner.id == fastest.id:
        chunks.append(
            f"It is also the fastest route ({_fmt_minutes(winner.duration_s)})."
        )
    else:
        delay_min = int(round(winner.delay_vs_fastest_s / 60.0))
        chunks.append(
            f"It is {delay_min} minutes slower than {fastest.label} "
            f"({fastest.id}), the fastest route."
        )

    for route in ranked:
        if not route.metrics.is_blocked:
            continue
        where = (
            ", ".join(f"mile {_fmt_miles(m)}" for m in route.no_travel_miles_at)
            if route.no_travel_miles_at
            else "one or more checkpoints"
        )
        chunks.append(f"{route.label} is blocked (No Travel at {where}).")

    return winner.id, " ".join(chunks), False
