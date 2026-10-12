import type { RiskLevel } from "@/lib/risk";

export type MilesByLevel = Record<
  "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "NO_TRAVEL" | "UNKNOWN",
  number
>;

export const RISK_BAR_ORDER: RiskLevel[] = [
  "LOW",
  "MODERATE",
  "HIGH",
  "SEVERE",
  "NO_TRAVEL",
  "UNKNOWN",
];

/**
 * Largest-remainder percentages that always sum to exactly 100.
 * All-zero → empty proportions (caller shows empty bar).
 */
export function riskBarProportions(
  miles: MilesByLevel | Record<string, number>,
): Record<RiskLevel, number> {
  const values = RISK_BAR_ORDER.map((key) => {
    const raw = Number(miles[key] ?? 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  });
  const total = values.reduce((sum, v) => sum + v, 0);
  const result = Object.fromEntries(RISK_BAR_ORDER.map((k) => [k, 0])) as Record<
    RiskLevel,
    number
  >;

  if (total <= 0) {
    return result;
  }

  const exact = values.map((v) => (v / total) * 100);
  const floors = exact.map((v) => Math.floor(v));
  const remaining = 100 - floors.reduce((sum, v) => sum + v, 0);
  const remainders = exact.map((v, i) => ({ i, frac: v - floors[i]! }));
  remainders.sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = [...floors];
  for (let n = 0; n < remaining; n += 1) {
    const idx = remainders[n % remainders.length]!.i;
    out[idx] = (out[idx] ?? 0) + 1;
  }

  RISK_BAR_ORDER.forEach((key, i) => {
    result[key] = out[i] ?? 0;
  });

  // Final guard: force exact 100 if float quirks remain.
  const sum = RISK_BAR_ORDER.reduce((s, k) => s + result[k], 0);
  if (sum !== 100) {
    const dominant = RISK_BAR_ORDER.reduce((best, k) =>
      result[k] >= result[best] ? k : best,
    );
    result[dominant] += 100 - sum;
  }
  return result;
}

/** Accessible text alternative e.g. "Low 25 mi, Moderate 25 mi, High 50 mi". */
export function riskBarLabel(miles: MilesByLevel): string {
  const parts: string[] = [];
  const labels: Record<RiskLevel, string> = {
    LOW: "Low",
    MODERATE: "Moderate",
    HIGH: "High",
    SEVERE: "Severe",
    NO_TRAVEL: "No Travel",
    UNKNOWN: "Unknown",
  };
  for (const key of RISK_BAR_ORDER) {
    const mi = miles[key] ?? 0;
    if (mi > 0) {
      const rounded = Math.abs(mi - Math.round(mi)) < 0.05 ? Math.round(mi) : Number(mi.toFixed(1));
      parts.push(`${labels[key]} ${rounded} mi`);
    }
  }
  return parts.length ? parts.join(", ") : "No risk miles";
}
