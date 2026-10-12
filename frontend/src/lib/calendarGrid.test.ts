import { describe, expect, it } from "vitest";

import {
  addMonths,
  monthCells,
  monthsInRange,
  sameDay,
  startOfMonth,
  yearsInRange,
} from "./calendarGrid";

describe("calendarGrid", () => {
  it("builds a Sunday-start grid with padding", () => {
    // 2026-10-01 is Thursday → 4 leading nulls
    const cells = monthCells(new Date(2026, 9, 1));
    expect(cells.slice(0, 4).every((c) => c === null)).toBe(true);
    expect(cells[4]).toEqual(new Date(2026, 9, 1));
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.length % 7).toBe(0);
  });

  it("lists months and years across a short window", () => {
    const from = new Date(2026, 9, 26);
    const to = new Date(2026, 10, 9);
    const months = monthsInRange(from, to);
    expect(months.map((m) => m.getMonth())).toEqual([9, 10]);
    expect(yearsInRange(from, to)).toEqual([2026]);
  });

  it("crosses year boundary", () => {
    const from = new Date(2026, 11, 28);
    const to = new Date(2027, 0, 10);
    expect(yearsInRange(from, to)).toEqual([2026, 2027]);
    expect(addMonths(startOfMonth(from), 1).getFullYear()).toBe(2027);
  });

  it("compares calendar days", () => {
    expect(
      sameDay(new Date(2026, 9, 26, 3), new Date(2026, 9, 26, 22)),
    ).toBe(true);
    expect(sameDay(new Date(2026, 9, 26), new Date(2026, 9, 27))).toBe(false);
  });
});
