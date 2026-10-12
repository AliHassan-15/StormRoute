import type { HeatmapPoint, HeatmapResponse } from "@/api/schemas";
import {
  normalizeRain,
  normalizeRiskLevel,
  normalizeSnow,
  normalizeWind,
  type HeatLayerKey,
} from "@/lib/heatmap/normalize";

const FRAME_COUNT = 49;

function padSeries(
  values: Array<number | null> | undefined,
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    out.push(values?.[i] ?? null);
  }
  return out;
}

function normSeries(
  layer: HeatLayerKey,
  raw: Array<number | null>,
): number[] {
  return raw.map((v) => {
    switch (layer) {
      case "wind":
        return normalizeWind(v).value;
      case "rain":
        return normalizeRain(v).value;
      case "snow":
        return normalizeSnow(v).value;
      case "risk":
        return normalizeRiskLevel(v).value;
    }
  });
}

function pointProperties(point: HeatmapPoint): Record<string, unknown> {
  const wind = padSeries(point.wind);
  const rain = padSeries(point.rain);
  const snow = padSeries(point.snow);
  const risk = padSeries(point.risk);
  const windN = normSeries("wind", wind);
  const rainN = normSeries("rain", rain);
  const snowN = normSeries("snow", snow);
  const riskN = normSeries("risk", risk);

  const props: Record<string, unknown> = {
    wind,
    rain,
    snow,
    risk,
    windN,
    rainN,
    snowN,
    riskN,
  };

  // Flat fallback keys for Mapbox paint (h0..h48 = active layer; also per-layer).
  for (let i = 0; i < FRAME_COUNT; i++) {
    props[`wind_${i}`] = windN[i];
    props[`rain_${i}`] = rainN[i];
    props[`snow_${i}`] = snowN[i];
    props[`risk_${i}`] = riskN[i];
    props[`h${i}`] = windN[i]; // default; refreshed on layer switch via setHKeys
  }
  return props;
}

/** Build GeoJSON for the single `heat-points` source. */
export function heatmapToGeoJson(
  data: HeatmapResponse,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: data.points.map((point, index) => ({
      type: "Feature",
      id: index,
      properties: pointProperties(point),
      geometry: {
        type: "Point",
        coordinates: [point.lng, point.lat],
      },
    })),
  };
}

/** Update h0..h48 to the normalised values for the active layer (in place). */
export function applyLayerHKeys(
  collection: GeoJSON.FeatureCollection,
  layer: HeatLayerKey,
): GeoJSON.FeatureCollection {
  const key = `${layer}_` as const;
  for (const feature of collection.features) {
    const props = feature.properties;
    if (!props) continue;
    for (let i = 0; i < FRAME_COUNT; i++) {
      const raw = props[`${key}${i}`];
      props[`h${i}`] = typeof raw === "number" ? raw : 0;
    }
  }
  return collection;
}

export function layerArrayKey(layer: HeatLayerKey): string {
  return `${layer}N`;
}
