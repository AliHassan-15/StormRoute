import type { AnalyzeRoute, Checkpoint } from "@/api/schemas";

export type CheckpointFeature = {
  type: "Feature";
  properties: {
    routeId: string;
    index: number;
    level: string;
    mile: number;
    eta_local: string;
    status: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
};

function levelForCheckpoint(cp: Checkpoint): string {
  if (cp.weather_status !== "ok" || cp.level_name === "UNKNOWN" || cp.level == null) {
    return "UNKNOWN";
  }
  return cp.level_name;
}

/** Build checkpoint Point features for a route. */
export function buildCheckpointFeatures(
  route: AnalyzeRoute,
): CheckpointFeature[] {
  return route.checkpoints.map((cp) => ({
    type: "Feature" as const,
    properties: {
      routeId: route.id,
      index: cp.index,
      level: levelForCheckpoint(cp),
      mile: cp.mile,
      eta_local: cp.eta_local,
      status: cp.weather_status,
    },
    geometry: {
      type: "Point" as const,
      coordinates: [cp.lng, cp.lat] as [number, number],
    },
  }));
}

export function buildCheckpointsGeoJson(
  routes: AnalyzeRoute[],
  selectedRouteId: string | null,
): { type: "FeatureCollection"; features: CheckpointFeature[] } {
  const route =
    routes.find((r) => r.id === selectedRouteId) ??
    routes.find((r) => r.is_recommended) ??
    routes[0];
  return {
    type: "FeatureCollection",
    features: route ? buildCheckpointFeatures(route) : [],
  };
}
