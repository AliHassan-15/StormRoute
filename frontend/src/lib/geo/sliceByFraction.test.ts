import { lineString } from "@turf/helpers";
import length from "@turf/length";
import { describe, expect, it } from "vitest";

import { lineLengthKm, sliceByFraction } from "@/lib/geo/sliceByFraction";

const LINE = {
  type: "LineString" as const,
  coordinates: [
    [-96.797, 32.7767],
    [-92.0, 37.0],
    [-87.6298, 41.8781],
  ] as [number, number][],
};

describe("sliceByFraction", () => {
  it("slices tile the line (sum ≈ full length within 0.1%)", () => {
    const full = lineLengthKm(LINE);
    const cuts = [0, 0.125, 0.375, 0.625, 0.875, 1];
    let sum = 0;
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const slice = sliceByFraction(LINE, cuts[i]!, cuts[i + 1]!);
      sum += lineLengthKm(slice);
    }
    expect(Math.abs(sum - full) / full).toBeLessThan(0.001);
  });

  it("fractions 0..1 return the whole line", () => {
    const sliced = sliceByFraction(LINE, 0, 1);
    const fullLen = length(lineString(LINE.coordinates), { units: "kilometers" });
    const sliceLen = length(lineString(sliced.coordinates), {
      units: "kilometers",
    });
    expect(Math.abs(sliceLen - fullLen) / fullLen).toBeLessThan(0.001);
    expect(sliced.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it("clamps out-of-range fractions", () => {
    const a = sliceByFraction(LINE, -1, 2);
    const b = sliceByFraction(LINE, 0, 1);
    expect(lineLengthKm(a)).toBeCloseTo(lineLengthKm(b), 5);
  });
});
