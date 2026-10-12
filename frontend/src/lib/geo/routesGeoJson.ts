import type { AnalyzeRoute } from "@/api/schemas";
import type { LineStringGeometry } from "@/lib/geo/sliceByFraction";

export type RouteFeature = {
  type: "Feature";
  properties: {
    routeId: string;
    rank: number;
  };
  geometry: LineStringGeometry;
};

export function buildRoutesGeoJson(routes: AnalyzeRoute[]): {
  type: "FeatureCollection";
  features: RouteFeature[];
} {
  return {
    type: "FeatureCollection",
    features: routes.map((route) => ({
      type: "Feature" as const,
      properties: {
        routeId: route.id,
        rank: route.rank,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: route.geometry.coordinates.map(
          (c) => [c[0], c[1]] as [number, number],
        ),
      },
    })),
  };
}
