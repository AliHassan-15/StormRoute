import { describe, expect, it } from "vitest";

import { formatDelta, formatDuration, formatLocalTime } from "@/lib/format";

describe("formatDuration", () => {
  it("formats mixed hours and minutes", () => {
    expect(formatDuration(3660)).toBe("1h 1m");
  });
  it("formats whole hours", () => {
    expect(formatDuration(3600)).toBe("1h");
  });
  it("formats minutes only", () => {
    expect(formatDuration(3540)).toBe("59m");
  });
  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0m");
  });
});

describe("formatDelta", () => {
  it("formats positive minutes", () => {
    expect(formatDelta(1500)).toBe("+25 min");
  });
  it("formats fastest", () => {
    expect(formatDelta(0)).toBe("Fastest");
  });
  it("formats hours and minutes", () => {
    expect(formatDelta(3900)).toBe("+1h 5m");
  });
});

describe("formatLocalTime", () => {
  it("uses API offset and does not convert", () => {
    expect(formatLocalTime("2026-10-14T07:00:00-05:00")).toBe("07:00");
  });
  it("shows date when day differs from departure", () => {
    expect(
      formatLocalTime("2026-10-15T01:20:00-05:00", {
        departureLocal: "2026-10-14T07:00:00-05:00",
      }),
    ).toBe("Oct 15, 01:20");
  });
});
