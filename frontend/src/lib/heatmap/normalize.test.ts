import { describe, expect, it } from "vitest";

import {
  normalizeRain,
  normalizeRiskLevel,
  normalizeSnow,
  normalizeWind,
} from "./normalize";

describe("heatmap normalisers", () => {
  it("normalises wind breakpoints and midpoints", () => {
    expect(normalizeWind(25).value).toBeCloseTo(0.25, 5);
    expect(normalizeWind(40).value).toBeCloseTo(0.625, 5);
    expect(normalizeWind(55).value).toBe(1);
    expect(normalizeWind(null)).toEqual({ value: 0, unavailable: true });
  });

  it("normalises rain mid-band", () => {
    expect(normalizeRain(0.375).value).toBeCloseTo(0.625, 5);
  });

  it("normalises snow mid-band", () => {
    expect(normalizeSnow(2.5).value).toBeCloseTo(0.875, 5);
  });

  it("normalises overall risk level", () => {
    expect(normalizeRiskLevel(3).value).toBe(0.5);
    expect(normalizeRiskLevel(null).unavailable).toBe(true);
  });
});
