import type { ExpressionSpecification } from "mapbox-gl";

/** Hex colours matching --sr-risk-* design tokens (Mapbox cannot read CSS vars). */
export const RISK_HEX = {
  LOW: "#22c55e",
  MODERATE: "#eab308",
  HIGH: "#f97316",
  SEVERE: "#ef4444",
  NO_TRAVEL: "#c026d3",
  UNKNOWN: "#64748b",
} as const;

export function riskColorMatch(
  prop = "level",
): ExpressionSpecification {
  return [
    "match",
    ["get", prop],
    "LOW",
    RISK_HEX.LOW,
    "MODERATE",
    RISK_HEX.MODERATE,
    "HIGH",
    RISK_HEX.HIGH,
    "SEVERE",
    RISK_HEX.SEVERE,
    "NO_TRAVEL",
    RISK_HEX.NO_TRAVEL,
    RISK_HEX.UNKNOWN,
  ];
}

export function routeWidthExpr(
  selectedId: string | null,
  hoveredId: string | null,
): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "routeId"], selectedId ?? ""],
    7,
    ["==", ["get", "routeId"], hoveredId ?? ""],
    5.5,
    3,
  ];
}

export function routeOpacityExpr(
  selectedId: string | null,
  hoveredId: string | null,
): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "routeId"], selectedId ?? ""],
    1,
    ["==", ["get", "routeId"], hoveredId ?? ""],
    0.85,
    0.55,
  ];
}
