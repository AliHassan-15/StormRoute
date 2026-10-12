import { describe, expect, it } from "vitest";

import { analyzeResponseSchema } from "@/api/schemas";
import { planFormSchema } from "@/lib/planSchema";
import golden from "@/test/fixtures/analyze-golden.json";

describe("analyzeResponseSchema", () => {
  it("accepts the golden fixture", () => {
    const parsed = analyzeResponseSchema.safeParse(golden);
    expect(parsed.success).toBe(true);
  });

  it("rejects when a required field is removed", () => {
    const rest = structuredClone(golden) as Record<string, unknown>;
    delete rest.recommendation;
    const parsed = analyzeResponseSchema.safeParse(rest);
    expect(parsed.success).toBe(false);
  });
});

describe("planFormSchema", () => {
  const base = {
    origin: { label: "A", lat: 32.7, lng: -96.8 },
    destination: { label: "B", lat: 41.8, lng: -87.6 },
    departure: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    interval: "auto" as const,
  };

  it("rejects load -1 and 200001", () => {
    expect(planFormSchema.safeParse({ ...base, loadLb: -1 }).success).toBe(false);
    expect(planFormSchema.safeParse({ ...base, loadLb: 200_001 }).success).toBe(
      false,
    );
  });

  it("accepts load 0 and 200000", () => {
    expect(planFormSchema.safeParse({ ...base, loadLb: 0 }).success).toBe(true);
    expect(planFormSchema.safeParse({ ...base, loadLb: 200_000 }).success).toBe(
      true,
    );
  });

  it("rejects departure 15 days ahead", () => {
    const dep = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      planFormSchema.safeParse({ ...base, loadLb: 0, departure: dep }).success,
    ).toBe(false);
  });
});
