import type {
  Expression,
  GeoJSONSource,
  Map as MapboxMap,
} from "mapbox-gl";

import { layerArrayKey } from "@/lib/heatmap/geojson";
import type { HeatLayerKey } from "@/lib/heatmap/normalize";
import { LAYER, SOURCE } from "@/map/ids";

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const COLOR_RAMP: Expression = [
  "interpolate",
  ["linear"],
  ["heatmap-density"],
  0,
  "rgba(0,0,0,0)",
  0.15,
  "#22c55e",
  0.35,
  "#eab308",
  0.55,
  "#f97316",
  0.75,
  "#ef4444",
  1,
  "#d946ef",
];

const RADIUS: Expression = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  30,
  6,
  45,
  8,
  70,
  10,
  110,
  12,
  150,
];

function weightExpr(layer: HeatLayerKey, hour: number): Expression {
  const arrKey = layerArrayKey(layer);
  const flatKey = `${layer}_${hour}`;
  const hKey = `h${hour}`;
  // Prefer normalised array via at/get; fall back to flat keys.
  return [
    "coalesce",
    ["at", hour, ["get", arrKey]],
    ["get", flatKey],
    ["get", hKey],
    0,
  ];
}

export function ensureHeatLayers(map: MapboxMap): void {
  if (!map.getSource(SOURCE.heatPoints)) {
    map.addSource(SOURCE.heatPoints, {
      type: "geojson",
      data: EMPTY,
    });
  }

  if (!map.getLayer(LAYER.heatmap)) {
    try {
      map.addLayer({
        id: LAYER.heatmap,
        type: "heatmap",
        source: SOURCE.heatPoints,
        paint: {
          "heatmap-weight": weightExpr("risk", 0),
          "heatmap-intensity": 0.85,
          "heatmap-radius": RADIUS,
          "heatmap-opacity": 0.85,
          "heatmap-color": COLOR_RAMP,
        },
      });
    } catch {
      // Blank styles without heatmap support — skip.
    }
  }

  if (!map.getLayer(LAYER.heatHit)) {
    try {
      map.addLayer({
        id: LAYER.heatHit,
        type: "circle",
        source: SOURCE.heatPoints,
        paint: {
          "circle-radius": 14,
          "circle-opacity": 0,
          "circle-stroke-opacity": 0,
        },
      });
    } catch {
      /* ignore */
    }
  }
}

export function setHeatData(
  map: MapboxMap,
  data: GeoJSON.FeatureCollection,
): void {
  ensureHeatLayers(map);
  const src = map.getSource(SOURCE.heatPoints);
  if (src && "setData" in src) {
    (src as GeoJSONSource).setData(data);
  }
}

export function setHeatHourPaint(
  map: MapboxMap,
  layer: HeatLayerKey,
  hour: number,
): void {
  if (!map.getLayer(LAYER.heatmap)) return;
  map.setPaintProperty(LAYER.heatmap, "heatmap-weight", weightExpr(layer, hour));
}

export function setHeatVisibility(map: MapboxMap, visible: boolean): void {
  const vis = visible ? "visible" : "none";
  for (const id of [LAYER.heatmap, LAYER.heatHit]) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", vis);
    }
  }
}
