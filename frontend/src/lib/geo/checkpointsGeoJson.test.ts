import { describe, expect, it } from "vitest";

import { buildCheckpointFeatures } from "@/lib/geo/checkpointsGeoJson";
import golden from "@/test/fixtures/analyze-golden.json";
import type { AnalyzeRoute } from "@/api/schemas";

describe("buildCheckpointFeatures", () => {
  it("keeps count and properties from golden route C", () => {
    const route = (golden.routes as AnalyzeRoute[]).find((r) => r.id === "C")!;
    const features = buildCheckpointFeatures(route);
    expect(features).toHaveLength(route.checkpoints.length);
    const first = features[0]!;
    expect(first.properties.routeId).toBe("C");
    expect(first.properties.index).toBe(0);
    expect(first.properties.mile).toBe(0);
    expect(first.properties.eta_local).toBe(route.checkpoints[0]!.eta_local);
    expect(first.properties.level).toBe("LOW");
    expect(first.geometry.coordinates).toEqual([
      route.checkpoints[0]!.lng,
      route.checkpoints[0]!.lat,
    ]);
  });
});
