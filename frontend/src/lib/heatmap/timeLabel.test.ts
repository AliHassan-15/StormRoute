import { describe, expect, it } from "vitest";

import { frameUtcMs } from "./timeLabel";

describe("frameUtcMs", () => {
  it("is t0 + h hours", () => {
    const t0 = "2026-10-12T12:00:00Z";
    expect(frameUtcMs(t0, 0)).toBe(Date.parse(t0));
    expect(frameUtcMs(t0, 3)).toBe(Date.parse(t0) + 3 * 3_600_000);
  });
});
