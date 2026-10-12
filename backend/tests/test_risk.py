"""Tests for the pure risk engine (D1–D4, D16). Written before implementation."""

from __future__ import annotations

import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from core.risk import (
    THRESHOLDS,
    CheckpointRisk,
    RiskLevel,
    Weather,
    assess,
    classify_rain,
    classify_snow,
    classify_wind,
    meta_payload,
)

GOLDEN_CASES: list[tuple[float, float, float, float, RiskLevel]] = [
    (24.9, 0, 0, 80000, RiskLevel.LOW),
    (25, 0, 0, 0, RiskLevel.MODERATE),
    (34.99, 0, 0, 80000, RiskLevel.MODERATE),
    (35, 0, 0, 40000, RiskLevel.HIGH),
    (35, 0, 0, 40001, RiskLevel.SEVERE),
    (44.99, 0, 0, 40000, RiskLevel.HIGH),
    (44.99, 0, 0, 45000, RiskLevel.SEVERE),
    (45, 0, 0, 30000, RiskLevel.SEVERE),
    (45, 0, 0, 30001, RiskLevel.NO_TRAVEL),
    (54.99, 0, 0, 30001, RiskLevel.NO_TRAVEL),
    (54.99, 0, 0, 0, RiskLevel.SEVERE),
    (55, 0, 0, 0, RiskLevel.NO_TRAVEL),
    (0, 0.0999, 0, 0, RiskLevel.LOW),
    (0, 0.10, 0, 0, RiskLevel.MODERATE),
    (0, 0.25, 0, 0, RiskLevel.HIGH),
    (0, 0.50, 0, 0, RiskLevel.SEVERE),
    (0, 1.00, 0, 0, RiskLevel.SEVERE),
    (0, 1.0001, 0, 0, RiskLevel.NO_TRAVEL),
    (0, 0, 0.49, 0, RiskLevel.LOW),
    (0, 0, 0.5, 0, RiskLevel.MODERATE),
    (0, 0, 1.0, 0, RiskLevel.HIGH),
    (0, 0, 2.0, 0, RiskLevel.SEVERE),
    (0, 0, 3.0, 0, RiskLevel.SEVERE),
    (0, 0, 3.01, 0, RiskLevel.NO_TRAVEL),
    (36, 0.6, 0, 10000, RiskLevel.SEVERE),
    (36, 1.5, 0, 45000, RiskLevel.NO_TRAVEL),
    (20, 0.30, 2.5, 0, RiskLevel.SEVERE),
    (12, 0.05, 0.2, 80000, RiskLevel.LOW),
]


@pytest.mark.parametrize(
    ("wind_mph", "rain_in_hr", "snow_in_hr", "load_lb", "expected"),
    GOLDEN_CASES,
)
def test_golden_final_level(
    wind_mph: float,
    rain_in_hr: float,
    snow_in_hr: float,
    load_lb: float,
    expected: RiskLevel,
) -> None:
    """Each hand-computed golden row maps to the expected final risk level."""
    result = assess(
        Weather(wind_mph=wind_mph, rain_in_hr=rain_in_hr, snow_in_hr=snow_in_hr),
        load_lb=load_lb,
    )
    assert result.final_level is expected


@pytest.mark.parametrize(
    ("fn", "value"),
    [
        (classify_wind, -1.0),
        (classify_rain, -0.01),
        (classify_snow, -0.5),
        (classify_wind, math.nan),
        (classify_rain, math.inf),
        (classify_snow, -math.inf),
    ],
)
def test_classify_rejects_invalid(fn, value: float) -> None:
    """Negative, NaN, and infinite inputs raise ValueError."""
    with pytest.raises(ValueError):
        fn(value)


def test_assess_rejects_invalid_load() -> None:
    """Load must be a finite non-negative number (lb)."""
    weather = Weather(wind_mph=10.0, rain_in_hr=0.0, snow_in_hr=0.0)
    with pytest.raises(ValueError):
        assess(weather, load_lb=-1.0)
    with pytest.raises(ValueError):
        assess(weather, load_lb=math.nan)


def test_risk_level_labels() -> None:
    """RiskLevel.label exposes driver-facing names."""
    assert RiskLevel.LOW.label == "Low"
    assert RiskLevel.MODERATE.label == "Moderate"
    assert RiskLevel.NO_TRAVEL.label == "No Travel"


# --- Hypothesis property tests -------------------------------------------------

finite_nonneg = st.floats(
    min_value=0.0,
    max_value=1e6,
    allow_nan=False,
    allow_infinity=False,
)


@given(
    wind=finite_nonneg,
    rain=finite_nonneg,
    snow=finite_nonneg,
    load=finite_nonneg,
)
@settings(max_examples=80)
def test_final_gte_base(wind: float, rain: float, snow: float, load: float) -> None:
    """Load rules never lower the level: final >= base always."""
    result = assess(Weather(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow), load_lb=load)
    assert result.final_level >= result.base_level
    assert isinstance(result.final_level, RiskLevel)
    assert result.final_level in {
        RiskLevel.LOW,
        RiskLevel.MODERATE,
        RiskLevel.HIGH,
        RiskLevel.SEVERE,
        RiskLevel.NO_TRAVEL,
    }


@given(wind=finite_nonneg, rain=finite_nonneg, snow=finite_nonneg, load=finite_nonneg)
@settings(max_examples=60)
def test_load_rules_never_lower(wind: float, rain: float, snow: float, load: float) -> None:
    """Applying a higher load cannot decrease final risk."""
    weather = Weather(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow)
    lighter = assess(weather, load_lb=load)
    heavier = assess(weather, load_lb=load + 10_000.0)
    assert heavier.final_level >= lighter.final_level


@given(
    w1=finite_nonneg,
    w2=finite_nonneg,
    rain=st.just(0.0),
    snow=st.just(0.0),
    load=st.just(0.0),
)
@settings(max_examples=40)
def test_monotonic_in_wind(w1: float, w2: float, rain: float, snow: float, load: float) -> None:
    """With other inputs fixed, higher wind never lowers final risk."""
    lo, hi = sorted((w1, w2))
    a = assess(Weather(wind_mph=lo, rain_in_hr=rain, snow_in_hr=snow), load_lb=load)
    b = assess(Weather(wind_mph=hi, rain_in_hr=rain, snow_in_hr=snow), load_lb=load)
    assert b.final_level >= a.final_level


@given(
    r1=finite_nonneg,
    r2=finite_nonneg,
    wind=st.just(0.0),
    snow=st.just(0.0),
    load=st.just(0.0),
)
@settings(max_examples=40)
def test_monotonic_in_rain(r1: float, r2: float, wind: float, snow: float, load: float) -> None:
    """With other inputs fixed, higher rain never lowers final risk."""
    lo, hi = sorted((r1, r2))
    a = assess(Weather(wind_mph=wind, rain_in_hr=lo, snow_in_hr=snow), load_lb=load)
    b = assess(Weather(wind_mph=wind, rain_in_hr=hi, snow_in_hr=snow), load_lb=load)
    assert b.final_level >= a.final_level


@given(
    s1=finite_nonneg,
    s2=finite_nonneg,
    wind=st.just(0.0),
    rain=st.just(0.0),
    load=st.just(0.0),
)
@settings(max_examples=40)
def test_monotonic_in_snow(s1: float, s2: float, wind: float, rain: float, load: float) -> None:
    """With other inputs fixed, higher snow never lowers final risk."""
    lo, hi = sorted((s1, s2))
    a = assess(Weather(wind_mph=wind, rain_in_hr=rain, snow_in_hr=lo), load_lb=load)
    b = assess(Weather(wind_mph=wind, rain_in_hr=rain, snow_in_hr=hi), load_lb=load)
    assert b.final_level >= a.final_level


@given(wind=finite_nonneg, rain=finite_nonneg, snow=finite_nonneg, load=finite_nonneg)
@settings(max_examples=60)
def test_final_equals_max_when_no_load_rule(
    wind: float, rain: float, snow: float, load: float
) -> None:
    """When no load rule raises, final equals max(wind, rain, snow) levels."""
    result = assess(Weather(wind_mph=wind, rain_in_hr=rain, snow_in_hr=snow), load_lb=load)
    condition_max = max(result.wind_level, result.rain_level, result.snow_level)
    if result.load_rule_applied is None:
        assert result.final_level == condition_max
        assert result.final_level == result.base_level


# --- Reasons ------------------------------------------------------------------


def test_low_checkpoint_has_no_reasons() -> None:
    """A fully LOW assessment produces an empty reasons tuple."""
    result = assess(Weather(wind_mph=12.0, rain_in_hr=0.05, snow_in_hr=0.2), load_lb=80_000)
    assert result.final_level is RiskLevel.LOW
    assert result.reasons == ()
    assert result.load_rule_applied is None


def test_load_rule_30001_produces_load_sentence() -> None:
    """Wind 45–54 with load >30,000 raises to No Travel and explains why."""
    result = assess(Weather(wind_mph=45.0, rain_in_hr=0.0, snow_in_hr=0.0), load_lb=30_001)
    assert result.final_level is RiskLevel.NO_TRAVEL
    assert result.load_rule_applied is not None
    assert any("30,000" in reason and "No Travel" in reason for reason in result.reasons)
    assert any("Wind" in reason and "Severe" in reason for reason in result.reasons)


def test_load_rule_40001_produces_load_sentence() -> None:
    """Wind 35–44 with load >40,000 raises to Severe and explains why."""
    result = assess(Weather(wind_mph=35.0, rain_in_hr=0.0, snow_in_hr=0.0), load_lb=40_001)
    assert result.final_level is RiskLevel.SEVERE
    assert result.load_rule_applied is not None
    assert any("40,000" in reason and "Severe" in reason for reason in result.reasons)


def test_load_rule_cannot_lower_worse_level() -> None:
    """A SEVERE-raising load rule must not reduce an existing NO_TRAVEL rain level."""
    result = assess(Weather(wind_mph=36.0, rain_in_hr=1.5, snow_in_hr=0.0), load_lb=45_000)
    assert result.final_level is RiskLevel.NO_TRAVEL
    assert result.base_level is RiskLevel.NO_TRAVEL
    assert result.load_rule_applied is None


def test_gust_not_classified() -> None:
    """Gusts are stored on Weather but do not affect classification (D4)."""
    calm = assess(Weather(wind_mph=10.0, rain_in_hr=0.0, snow_in_hr=0.0, gust_mph=80.0), 0)
    assert calm.final_level is RiskLevel.LOW


def test_checkpoint_risk_is_frozen() -> None:
    """CheckpointRisk is immutable."""
    result = assess(Weather(0.0, 0.0, 0.0), 0.0)
    assert isinstance(result, CheckpointRisk)
    with pytest.raises(AttributeError):
        result.final_level = RiskLevel.SEVERE  # type: ignore[misc]


# --- /api/meta ----------------------------------------------------------------


def test_meta_payload_matches_thresholds() -> None:
    """meta_payload is derived from THRESHOLDS, including inclusive rain SEVERE at 1.00."""
    payload = meta_payload()
    assert payload["thresholds"] is not THRESHOLDS  # serialized view
    rain_bands = payload["thresholds"]["rain_in_hr"]["bands"]
    severe = next(band for band in rain_bands if band["level"] == "SEVERE")
    assert severe["upper"] == 1.0
    assert severe["upper_inclusive"] is True
    assert {level["name"] for level in payload["levels"]} >= {
        "LOW",
        "MODERATE",
        "HIGH",
        "SEVERE",
        "NO_TRAVEL",
    }
    assert payload["load_rules"]
    assert payload["units"]["wind"] == "mph"


def test_api_meta_endpoint() -> None:
    """GET /api/meta returns thresholds derived from core.risk.THRESHOLDS."""
    client = APIClient()
    response = client.get("/api/meta")
    assert response.status_code == 200
    body = response.json()
    assert body == meta_payload()
    rain_bands = body["thresholds"]["rain_in_hr"]["bands"]
    severe = next(band for band in rain_bands if band["level"] == "SEVERE")
    assert severe["upper"] == 1.00
    assert severe["upper_inclusive"] is True


def test_internal_helpers_edge_branches() -> None:
    """Cover rare helper branches required for full risk.py coverage."""
    from core import risk as risk_mod

    rule_any = THRESHOLDS["load_rules"][0]
    assert "55" in risk_mod._load_rule_reason(rule_any, 60.0, 1_000.0)

    orphan = risk_mod.LoadRule(
        id="custom_rule",
        wind_lower=0.0,
        wind_upper=None,
        wind_lower_inclusive=True,
        wind_upper_inclusive=True,
        load_gt_lb=None,
        raises_to=RiskLevel.SEVERE,
        description="custom",
    )
    assert "custom_rule" in risk_mod._load_rule_reason(orphan, 10.0, 1.0)

    with pytest.raises(ValueError, match="No risk band"):
        risk_mod._classify_from_bands(1.0, (), quantity="wind_mph")

    with pytest.raises(ValueError):
        risk_mod._require_finite_nonnegative("load_lb", True)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        risk_mod._require_finite_nonnegative("load_lb", "nope")  # type: ignore[arg-type]

    # Exercise exclusive lower-bound branches on synthetic bands/rules.
    exclusive = risk_mod.Band(RiskLevel.HIGH, 10.0, 20.0, False, False)
    assert risk_mod._in_band(10.0, exclusive) is False
    assert risk_mod._in_band(10.1, exclusive) is True
    assert risk_mod._in_band(20.0, exclusive) is False

    inclusive_lower = risk_mod.Band(RiskLevel.MODERATE, 25.0, 35.0, True, False)
    assert risk_mod._in_band(24.9, inclusive_lower) is False
    assert risk_mod._in_band(25.0, inclusive_lower) is True

    upper_incl = risk_mod.Band(RiskLevel.SEVERE, None, 5.0, True, True)
    assert risk_mod._in_band(5.0, upper_incl) is True
    assert risk_mod._in_band(5.1, upper_incl) is False

    rule_excl = risk_mod.LoadRule(
        id="excl",
        wind_lower=10.0,
        wind_upper=20.0,
        wind_lower_inclusive=False,
        wind_upper_inclusive=True,
        load_gt_lb=None,
        raises_to=RiskLevel.HIGH,
        description="excl",
    )
    assert risk_mod._wind_matches_rule(10.0, rule_excl) is False
    assert risk_mod._wind_matches_rule(10.1, rule_excl) is True
    assert risk_mod._wind_matches_rule(20.0, rule_excl) is True
    assert risk_mod._wind_matches_rule(20.1, rule_excl) is False
