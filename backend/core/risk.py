"""
Weather and load risk classification (D1–D4, D16).

THRESHOLDS is the single source of truth for bands and load rules. classify_*
and GET /api/meta are derived from it. Units: wind mph, rain in/hr, snow in/hr,
load lb.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import IntEnum
from typing import Any, Final


class RiskLevel(IntEnum):
    """Ordered weather/load risk levels used for ranking (D9)."""

    LOW = 1
    MODERATE = 2
    HIGH = 3
    SEVERE = 4
    NO_TRAVEL = 5

    @property
    def label(self) -> str:
        """Driver-facing label for this level."""
        if self is RiskLevel.NO_TRAVEL:
            return "No Travel"
        return self.name.replace("_", " ").title()


@dataclass(frozen=True)
class Band:
    """Inclusive/exclusive interval mapped to a RiskLevel."""

    level: RiskLevel
    lower: float | None
    upper: float | None
    lower_inclusive: bool
    upper_inclusive: bool


@dataclass(frozen=True)
class LoadRule:
    """Load rule that may only RAISE the base classification (D2)."""

    id: str
    wind_lower: float
    wind_upper: float | None
    wind_lower_inclusive: bool
    wind_upper_inclusive: bool
    load_gt_lb: float | None
    raises_to: RiskLevel
    description: str


@dataclass(frozen=True)
class Weather:
    """Checkpoint weather. Gusts are display-only (D4)."""

    wind_mph: float
    rain_in_hr: float
    snow_in_hr: float
    gust_mph: float | None = None


@dataclass(frozen=True)
class CheckpointRisk:
    """Condition levels, load-adjusted final level, and driver reasons (D3)."""

    wind_level: RiskLevel
    rain_level: RiskLevel
    snow_level: RiskLevel
    base_level: RiskLevel
    final_level: RiskLevel
    load_rule_applied: str | None
    reasons: tuple[str, ...]


def _band(
    level: RiskLevel,
    lower: float | None,
    upper: float | None,
    *,
    lo_incl: bool = True,
    hi_incl: bool = False,
) -> Band:
    return Band(level, lower, upper, lo_incl, hi_incl)


def _rule(
    rule_id: str,
    wind_lo: float,
    wind_hi: float | None,
    load_gt: float | None,
    raises_to: RiskLevel,
    description: str,
    *,
    wind_hi_incl: bool = False,
) -> LoadRule:
    return LoadRule(
        rule_id,
        wind_lo,
        wind_hi,
        True,
        wind_hi_incl if wind_hi is not None else True,
        load_gt,
        raises_to,
        description,
    )


THRESHOLDS_VERSION: Final[str] = "1.0.0"

THRESHOLDS: Final[dict[str, Any]] = {
    "version": THRESHOLDS_VERSION,
    "units": {"wind": "mph", "rain": "in/hr", "snow": "in/hr", "load": "lb", "gust": "mph"},
    "wind_mph": {
        "bands": (
            _band(RiskLevel.LOW, None, 25.0),
            _band(RiskLevel.MODERATE, 25.0, 35.0),
            _band(RiskLevel.HIGH, 35.0, 45.0),
            _band(RiskLevel.SEVERE, 45.0, 55.0),
            _band(RiskLevel.NO_TRAVEL, 55.0, None, hi_incl=True),
        ),
    },
    "rain_in_hr": {
        "bands": (
            _band(RiskLevel.LOW, None, 0.10),
            _band(RiskLevel.MODERATE, 0.10, 0.25),
            _band(RiskLevel.HIGH, 0.25, 0.50),
            _band(RiskLevel.SEVERE, 0.50, 1.00, hi_incl=True),
            _band(RiskLevel.NO_TRAVEL, 1.00, None, lo_incl=False, hi_incl=True),
        ),
    },
    "snow_in_hr": {
        "bands": (
            _band(RiskLevel.LOW, None, 0.5),
            _band(RiskLevel.MODERATE, 0.5, 1.0),
            _band(RiskLevel.HIGH, 1.0, 2.0),
            _band(RiskLevel.SEVERE, 2.0, 3.0, hi_incl=True),
            _band(RiskLevel.NO_TRAVEL, 3.0, None, lo_incl=False, hi_incl=True),
        ),
    },
    "load_rules": (
        _rule(
            "wind_gte_55_any_load",
            55.0,
            None,
            None,
            RiskLevel.NO_TRAVEL,
            "Wind >=55 mph: No Travel for any load",
            wind_hi_incl=True,
        ),
        _rule(
            "wind_45_54_load_gt_30000",
            45.0,
            55.0,
            30_000.0,
            RiskLevel.NO_TRAVEL,
            "Wind 45-54 mph and load >30,000 lb: No Travel",
        ),
        _rule(
            "wind_35_44_load_gt_40000",
            35.0,
            45.0,
            40_000.0,
            RiskLevel.SEVERE,
            "Wind 35-44 mph and load >40,000 lb: Severe",
        ),
    ),
}


def _require_finite_nonnegative(name: str, value: float) -> float:
    """Validate a numeric input in the caller's units."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ValueError(f"{name} must be a finite number, got {value!r}")
    number = float(value)
    if not math.isfinite(number) or number < 0.0:
        raise ValueError(f"{name} must be finite and >= 0, got {value!r}")
    return number


def _in_range(
    value: float,
    lower: float | None,
    upper: float | None,
    lower_inclusive: bool,
    upper_inclusive: bool,
) -> bool:
    """Half-open/closed range check used by bands and load-rule wind windows."""
    if lower is not None:
        if lower_inclusive:
            if value < lower:
                return False
        elif value <= lower:
            return False
    if upper is not None:
        if upper_inclusive:
            if value > upper:
                return False
        elif value >= upper:
            return False
    return True


def _in_band(value: float, band: Band) -> bool:
    """Return True if value falls inside band using its inclusivity flags."""
    return _in_range(
        value, band.lower, band.upper, band.lower_inclusive, band.upper_inclusive
    )


def _classify_from_bands(value: float, bands: Sequence[Band], *, quantity: str) -> RiskLevel:
    """Map a validated measurement onto RiskLevel using THRESHOLDS bands."""
    for band in bands:
        if _in_band(value, band):
            return band.level
    raise ValueError(f"No risk band matched for {quantity}={value!r}")


def classify_wind(mph: float) -> RiskLevel:
    """Classify sustained wind speed in mph (D1). Gusts are not used."""
    value = _require_finite_nonnegative("wind_mph", mph)
    return _classify_from_bands(value, THRESHOLDS["wind_mph"]["bands"], quantity="wind_mph")


def classify_rain(in_hr: float) -> RiskLevel:
    """Classify rain rate in inches per hour (D1, D4)."""
    value = _require_finite_nonnegative("rain_in_hr", in_hr)
    return _classify_from_bands(
        value, THRESHOLDS["rain_in_hr"]["bands"], quantity="rain_in_hr"
    )


def classify_snow(in_hr: float) -> RiskLevel:
    """Classify snowfall rate in inches of snow per hour (D1, D4)."""
    value = _require_finite_nonnegative("snow_in_hr", in_hr)
    return _classify_from_bands(
        value, THRESHOLDS["snow_in_hr"]["bands"], quantity="snow_in_hr"
    )


def _wind_matches_rule(wind_mph: float, rule: LoadRule) -> bool:
    """Return True if sustained wind (mph) falls in the rule's wind window."""
    return _in_range(
        wind_mph,
        rule.wind_lower,
        rule.wind_upper,
        rule.wind_lower_inclusive,
        rule.wind_upper_inclusive,
    )


def _load_matches_rule(load_lb: float, rule: LoadRule) -> bool:
    """Return True if load (lb) satisfies the rule's strict greater-than bound."""
    return True if rule.load_gt_lb is None else load_lb > rule.load_gt_lb


def _format_display_number(value: float, *, decimals: int) -> str:
    """Format a number for driver-facing text; never used for classification."""
    rounded = round(value, decimals)
    if decimals == 0 or abs(rounded - round(rounded)) < 1e-12:
        return f"{int(round(rounded)):,}"
    return f"{rounded:,.{decimals}f}".rstrip("0").rstrip(".")


def _condition_reason(
    name: str, value: float, unit: str, level: RiskLevel, *, decimals: int
) -> str:
    """Plain-English reason for a MODERATE+ weather condition."""
    shown = _format_display_number(value, decimals=decimals)
    return f"{name} {shown} {unit} is {level.label}."


def _load_rule_reason(rule: LoadRule, wind_mph: float, load_lb: float) -> str:
    """Driver-facing sentence for a load rule that raised the level."""
    load_text = _format_display_number(load_lb, decimals=0)
    wind_text = _format_display_number(wind_mph, decimals=1)
    if rule.id == "wind_gte_55_any_load":
        return (
            f"Load {load_text} lb with wind {wind_text} mph "
            f"(>=55 mph): {rule.raises_to.label}."
        )
    if rule.id == "wind_45_54_load_gt_30000":
        return (
            f"Load {load_text} lb is over 30,000 lb with wind 45-54 mph: "
            f"{rule.raises_to.label}."
        )
    if rule.id == "wind_35_44_load_gt_40000":
        return (
            f"Load {load_text} lb is over 40,000 lb with wind 35-44 mph: "
            f"{rule.raises_to.label}."
        )
    return f"Load rule {rule.id} raised risk to {rule.raises_to.label}."


def assess(weather: Weather, load_lb: float) -> CheckpointRisk:
    """Classify a checkpoint from weather and load (D1–D4). Gusts ignored."""
    wind_mph = _require_finite_nonnegative("wind_mph", weather.wind_mph)
    rain_in_hr = _require_finite_nonnegative("rain_in_hr", weather.rain_in_hr)
    snow_in_hr = _require_finite_nonnegative("snow_in_hr", weather.snow_in_hr)
    load = _require_finite_nonnegative("load_lb", load_lb)

    wind_level = classify_wind(wind_mph)
    rain_level = classify_rain(rain_in_hr)
    snow_level = classify_snow(snow_in_hr)
    base_level = max(wind_level, rain_level, snow_level)

    applied_rule: LoadRule | None = None
    raised_to = base_level
    for rule in THRESHOLDS["load_rules"]:
        if not _wind_matches_rule(wind_mph, rule) or not _load_matches_rule(load, rule):
            continue
        if rule.raises_to > raised_to:
            raised_to = rule.raises_to
            applied_rule = rule

    reasons: list[str] = []
    if wind_level >= RiskLevel.MODERATE:
        reasons.append(_condition_reason("Wind", wind_mph, "mph", wind_level, decimals=1))
    if rain_level >= RiskLevel.MODERATE:
        reasons.append(
            _condition_reason("Rain", rain_in_hr, "in/hr", rain_level, decimals=4)
        )
    if snow_level >= RiskLevel.MODERATE:
        reasons.append(
            _condition_reason("Snow", snow_in_hr, "in/hr", snow_level, decimals=2)
        )
    if applied_rule is not None:
        reasons.append(_load_rule_reason(applied_rule, wind_mph, load))

    return CheckpointRisk(
        wind_level=wind_level,
        rain_level=rain_level,
        snow_level=snow_level,
        base_level=base_level,
        final_level=raised_to,
        load_rule_applied=applied_rule.id if applied_rule is not None else None,
        reasons=tuple(reasons),
    )


def meta_payload() -> dict[str, Any]:
    """Build GET /api/meta from THRESHOLDS without retyping bounds (D16)."""
    units: Mapping[str, str] = THRESHOLDS["units"]

    def band_dict(band: Band) -> dict[str, Any]:
        return {
            "level": band.level.name,
            "value": int(band.level),
            "lower": band.lower,
            "upper": band.upper,
            "lower_inclusive": band.lower_inclusive,
            "upper_inclusive": band.upper_inclusive,
        }

    def rule_dict(rule: LoadRule) -> dict[str, Any]:
        return {
            "id": rule.id,
            "wind_lower": rule.wind_lower,
            "wind_upper": rule.wind_upper,
            "wind_lower_inclusive": rule.wind_lower_inclusive,
            "wind_upper_inclusive": rule.wind_upper_inclusive,
            "load_gt_lb": rule.load_gt_lb,
            "raises_to": rule.raises_to.name,
            "raises_to_value": int(rule.raises_to),
            "description": rule.description,
        }

    return {
        "levels": [
            {"value": int(level), "name": level.name, "label": level.label}
            for level in RiskLevel
        ],
        "thresholds": {
            "wind_mph": {
                "bands": [band_dict(b) for b in THRESHOLDS["wind_mph"]["bands"]]
            },
            "rain_in_hr": {
                "bands": [band_dict(b) for b in THRESHOLDS["rain_in_hr"]["bands"]]
            },
            "snow_in_hr": {
                "bands": [band_dict(b) for b in THRESHOLDS["snow_in_hr"]["bands"]]
            },
        },
        "load_rules": [rule_dict(rule) for rule in THRESHOLDS["load_rules"]],
        "units": dict(units),
        "version": THRESHOLDS["version"],
    }
