import { describe, expect, it } from "vitest";

import {
  buildCoverageFractions,
  coverageMilesToFractions,
} from "@/lib/geo/riskSegments";
import type { Checkpoint } from "@/api/schemas";

function cp(
  index: number,
  from: number,
  to: number,
): Checkpoint {
  return {
    index,
    mile: (from + to) / 2,
    lat: 0,
    lng: 0,
    eta_utc: "2026-10-14T12:00:00Z",
    eta_local: "2026-10-14T07:00:00-05:00",
    tz: "America/Chicago",
    coverage_from_mi: from,
    coverage_to_mi: to,
    weather: { wind_mph: 10, gust_mph: null, rain_in_hr: 0, snow_in_hr: 0 },
    weather_status: "ok",
    level: 1,
    level_name: "LOW",
    condition_levels: { wind: "LOW", rain: "LOW", snow: "LOW" },
    reasons: [],
  };
}

describe("coverageMilesToFractions", () => {
  it("golden: 12.5/25/25/25/12.5 of 100 mi", () => {
    const spans = [
      [0, 12.5],
      [12.5, 37.5],
      [37.5, 62.5],
      [62.5, 87.5],
      [87.5, 100],
    ] as const;
    const expected = [
      [0, 0.125],
      [0.125, 0.375],
      [0.375, 0.625],
      [0.625, 0.875],
      [0.875, 1],
    ] as const;

    spans.forEach(([from, to], i) => {
      const { startFrac, endFrac } = coverageMilesToFractions(from, to, 100);
      expect(startFrac).toBeCloseTo(expected[i]![0], 10);
      expect(endFrac).toBeCloseTo(expected[i]![1], 10);
    });

    const fracs = buildCoverageFractions(
      spans.map(([from, to], i) => cp(i, from, to)),
      100,
    );
    expect(fracs.map((f) => [f.startFrac, f.endFrac])).toEqual(
      expected.map(([a, b]) => [a, b]),
    );
  });
});
