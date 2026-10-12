import type { AnalyzeRoute, Checkpoint } from "@/api/schemas";
import {
  sliceByFraction,
  type LineStringGeometry,
} from "@/lib/geo/sliceByFraction";

export interface CoverageFraction {
  startFrac: number;
  endFrac: number;
  coverage_from_mi: number;
  coverage_to_mi: number;
  checkpointIndex: number;
  level: string;
}

/**
 * Convert checkpoint coverage miles to fractions of route distance.
 * Units: coverage_*_mi and distance_mi are miles; fractions are unitless.
 */
export function coverageMilesToFractions(
  coverageFromMi: number,
  coverageToMi: number,
  distanceMi: number,
): { startFrac: number; endFrac: number } {
  if (!(distanceMi > 0)) return { startFrac: 0, endFrac: 0 };
  return {
    startFrac: coverageFromMi / distanceMi,
    endFrac: coverageToMi / distanceMi,
  };
}

export function buildCoverageFractions(
  checkpoints: Checkpoint[],
  distanceMi: number,
): CoverageFraction[] {
  return checkpoints.map((cp) => {
    const { startFrac, endFrac } = coverageMilesToFractions(
      cp.coverage_from_mi,
      cp.coverage_to_mi,
      distanceMi,
    );
    const unknown =
      cp.weather_status !== "ok" || cp.level_name === "UNKNOWN" || cp.level == null;
    return {
      startFrac,
      endFrac,
      coverage_from_mi: cp.coverage_from_mi,
      coverage_to_mi: cp.coverage_to_mi,
      checkpointIndex: cp.index,
      level: unknown ? "UNKNOWN" : cp.level_name,
    };
  });
}

export type RiskSegmentFeature = {
  type: "Feature";
  properties: {
    routeId: string;
    level: string;
    checkpointIndex: number;
    segmentId: string;
  };
  geometry: LineStringGeometry;
};

/** Build risk-segment LineString features for one route. */
export function buildRiskSegmentsForRoute(
  route: AnalyzeRoute,
): RiskSegmentFeature[] {
  const geometry = route.geometry;
  const fracs = buildCoverageFractions(route.checkpoints, route.distance_mi);
  const features: RiskSegmentFeature[] = [];

  for (const frac of fracs) {
    if (frac.endFrac <= frac.startFrac) continue;
    const sliced = sliceByFraction(geometry, frac.startFrac, frac.endFrac);
    features.push({
      type: "Feature",
      properties: {
        routeId: route.id,
        level: frac.level,
        checkpointIndex: frac.checkpointIndex,
        segmentId: `${route.id}-${frac.checkpointIndex}`,
      },
      geometry: sliced,
    });
  }
  return features;
}

export function buildRiskSegmentsGeoJson(routes: AnalyzeRoute[]): {
  type: "FeatureCollection";
  features: RiskSegmentFeature[];
} {
  return {
    type: "FeatureCollection",
    features: routes.flatMap(buildRiskSegmentsForRoute),
  };
}
