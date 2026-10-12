import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RISK_BAR_ORDER, riskBarProportions } from "@/lib/riskBar";

describe("riskBarProportions", () => {
  it("always sums to exactly 100 (property)", () => {
    fc.assert(
      fc.property(
        fc.record({
          LOW: fc.float({ min: 0, max: 1e6, noNaN: true }),
          MODERATE: fc.float({ min: 0, max: 1e6, noNaN: true }),
          HIGH: fc.float({ min: 0, max: 1e6, noNaN: true }),
          SEVERE: fc.float({ min: 0, max: 1e6, noNaN: true }),
          NO_TRAVEL: fc.float({ min: 0, max: 1e6, noNaN: true }),
          UNKNOWN: fc.float({ min: 0, max: 1e6, noNaN: true }),
        }),
        (miles) => {
          const props = riskBarProportions(miles);
          const sum = RISK_BAR_ORDER.reduce((s, k) => s + props[k], 0);
          const total = RISK_BAR_ORDER.reduce((s, k) => s + (miles[k] ?? 0), 0);
          if (total <= 0) {
            expect(sum).toBe(0);
          } else {
            expect(sum).toBe(100);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("handles all-zero", () => {
    const props = riskBarProportions({
      LOW: 0,
      MODERATE: 0,
      HIGH: 0,
      SEVERE: 0,
      NO_TRAVEL: 0,
      UNKNOWN: 0,
    });
    expect(RISK_BAR_ORDER.reduce((s, k) => s + props[k], 0)).toBe(0);
  });

  it("handles single segment", () => {
    const props = riskBarProportions({
      LOW: 0,
      MODERATE: 0,
      HIGH: 50,
      SEVERE: 0,
      NO_TRAVEL: 0,
      UNKNOWN: 0,
    });
    expect(props.HIGH).toBe(100);
    expect(RISK_BAR_ORDER.reduce((s, k) => s + props[k], 0)).toBe(100);
  });
});
