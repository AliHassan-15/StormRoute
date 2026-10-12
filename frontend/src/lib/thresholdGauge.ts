import type { MetaResponse } from "@/api/schemas";

export type ConditionKey = "wind_mph" | "rain_in_hr" | "snow_in_hr";

/**
 * Position of a value inside the condition's threshold span as 0..1.
 * Uses /api/meta band upper bounds; units match the condition.
 */
export function thresholdGaugePosition(
  meta: MetaResponse | undefined,
  key: ConditionKey,
  value: number | null | undefined,
): number {
  if (value == null || !Number.isFinite(value) || !meta) return 0;
  const bands = meta.thresholds[key]?.bands ?? [];
  if (!bands.length) return 0;
  const uppers = bands
    .map((b) => b.upper)
    .filter((u): u is number => u != null && Number.isFinite(u));
  const max = Math.max(...uppers, value);
  if (!(max > 0)) return 0;
  return Math.min(1, Math.max(0, value / max));
}
