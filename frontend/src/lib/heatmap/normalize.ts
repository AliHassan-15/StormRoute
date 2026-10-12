/**
 * Heatmap intensity normalisers (0..1) from risk band lower bounds (D16).
 * Null / non-finite values map to 0 and are flagged unavailable.
 */

export type HeatLayerKey = "wind" | "rain" | "snow" | "risk";

export interface NormalizeResult {
  value: number;
  unavailable: boolean;
}

function lerpBreakpoints(
  x: number,
  xs: readonly number[],
  ys: readonly number[],
): number {
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs[xs.length - 1]!) return ys[ys.length - 1]!;
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]!) {
      const t = (x - xs[i - 1]!) / (xs[i]! - xs[i - 1]!);
      return ys[i - 1]! + t * (ys[i]! - ys[i - 1]!);
    }
  }
  return ys[ys.length - 1]!;
}

const WIND_X = [0, 25, 35, 45, 55] as const;
const WIND_Y = [0, 0.25, 0.5, 0.75, 1] as const;
const RAIN_X = [0, 0.1, 0.25, 0.5, 1.0] as const;
const RAIN_Y = [0, 0.25, 0.5, 0.75, 1] as const;
const SNOW_X = [0, 0.5, 1.0, 2.0, 3.0] as const;
const SNOW_Y = [0, 0.25, 0.5, 0.75, 1] as const;

export function normalizeWind(mph: number | null | undefined): NormalizeResult {
  if (mph == null || !Number.isFinite(mph)) {
    return { value: 0, unavailable: true };
  }
  return {
    value: lerpBreakpoints(mph, WIND_X, WIND_Y),
    unavailable: false,
  };
}

export function normalizeRain(
  inPerHr: number | null | undefined,
): NormalizeResult {
  if (inPerHr == null || !Number.isFinite(inPerHr)) {
    return { value: 0, unavailable: true };
  }
  return {
    value: lerpBreakpoints(inPerHr, RAIN_X, RAIN_Y),
    unavailable: false,
  };
}

export function normalizeSnow(
  inPerHr: number | null | undefined,
): NormalizeResult {
  if (inPerHr == null || !Number.isFinite(inPerHr)) {
    return { value: 0, unavailable: true };
  }
  return {
    value: lerpBreakpoints(inPerHr, SNOW_X, SNOW_Y),
    unavailable: false,
  };
}

export function normalizeRiskLevel(
  level: number | null | undefined,
): NormalizeResult {
  if (level == null || !Number.isFinite(level)) {
    return { value: 0, unavailable: true };
  }
  const clamped = Math.min(5, Math.max(1, level));
  return { value: (clamped - 1) / 4, unavailable: false };
}

export function normalizeForLayer(
  layer: HeatLayerKey,
  value: number | null | undefined,
): NormalizeResult {
  switch (layer) {
    case "wind":
      return normalizeWind(value);
    case "rain":
      return normalizeRain(value);
    case "snow":
      return normalizeSnow(value);
    case "risk":
      return normalizeRiskLevel(value);
  }
}

/** Legend stops in real units for relative-intensity labels. */
export const LAYER_LEGEND: Record<
  HeatLayerKey,
  { unit: string; stops: { value: number; label: string }[] }
> = {
  wind: {
    unit: "mph",
    stops: [
      { value: 0, label: "0" },
      { value: 25, label: "25" },
      { value: 35, label: "35" },
      { value: 45, label: "45" },
      { value: 55, label: "55+" },
    ],
  },
  rain: {
    unit: "in/hr",
    stops: [
      { value: 0, label: "0" },
      { value: 0.1, label: "0.10" },
      { value: 0.25, label: "0.25" },
      { value: 0.5, label: "0.50" },
      { value: 1.0, label: "1.00+" },
    ],
  },
  snow: {
    unit: "in/hr",
    stops: [
      { value: 0, label: "0" },
      { value: 0.5, label: "0.5" },
      { value: 1.0, label: "1.0" },
      { value: 2.0, label: "2.0" },
      { value: 3.0, label: "3.0+" },
    ],
  },
  risk: {
    unit: "level",
    stops: [
      { value: 1, label: "Low" },
      { value: 2, label: "Mod" },
      { value: 3, label: "High" },
      { value: 4, label: "Sev" },
      { value: 5, label: "No travel" },
    ],
  },
};
