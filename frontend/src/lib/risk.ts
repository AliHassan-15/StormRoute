export const RISK_LEVELS = [
  "LOW",
  "MODERATE",
  "HIGH",
  "SEVERE",
  "NO_TRAVEL",
  "UNKNOWN",
] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

export const RISK_LABELS: Record<RiskLevel, string> = {
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
  SEVERE: "Severe",
  NO_TRAVEL: "No Travel",
  UNKNOWN: "Unknown",
};

export const RISK_SWATCH_CLASS: Record<RiskLevel, string> = {
  LOW: "risk-swatch-low",
  MODERATE: "risk-swatch-moderate",
  HIGH: "risk-swatch-high",
  SEVERE: "risk-swatch-severe",
  NO_TRAVEL: "risk-swatch-no-travel",
  UNKNOWN: "risk-swatch-unknown",
};
