import type { AnyLayer, Map as MapboxMap } from "mapbox-gl";

import { ensureHeatLayers } from "@/map/heatLayers";
import { LAYER, SOURCE } from "@/map/ids";
import {
  riskColorMatch,
  routeOpacityExpr,
  routeWidthExpr,
} from "@/map/riskPaint";

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

function ensureSource(
  map: MapboxMap,
  id: string,
  options?: { promoteId?: string },
): void {
  if (map.getSource(id)) return;
  map.addSource(id, {
    type: "geojson",
    data: EMPTY,
    ...(options?.promoteId ? { promoteId: options.promoteId } : {}),
  });
}

function ensureLayer(map: MapboxMap, layer: AnyLayer, beforeId?: string): void {
  if (map.getLayer(layer.id)) return;
  try {
    map.addLayer(layer, beforeId);
  } catch {
    // Blank/offline styles may reject symbol layers without glyphs — skip.
  }
}

/**
 * Idempotent install of StormRoute sources/layers. Safe after style.load.
 */
export function installLayers(map: MapboxMap): void {
  ensureSource(map, SOURCE.routes, { promoteId: "routeId" });
  ensureSource(map, SOURCE.riskSegments, { promoteId: "segmentId" });
  ensureSource(map, SOURCE.checkpoints, { promoteId: "index" });

  ensureLayer(map, {
    id: LAYER.routesCasing,
    type: "line",
    source: SOURCE.routes,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#0b1e26",
      "line-width": 10,
      "line-opacity": 0.35,
    },
  });

  ensureLayer(map, {
    id: LAYER.routesBase,
    type: "line",
    source: SOURCE.routes,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#94a3b8",
      "line-width": routeWidthExpr(null, null),
      "line-opacity": routeOpacityExpr(null, null),
    },
  });

  ensureLayer(map, {
    id: LAYER.riskSolid,
    type: "line",
    source: SOURCE.riskSegments,
    filter: [
      "all",
      ["!=", ["get", "level"], "NO_TRAVEL"],
      ["!=", ["get", "level"], "UNKNOWN"],
    ],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": riskColorMatch(),
      "line-width": routeWidthExpr(null, null),
      "line-opacity": routeOpacityExpr(null, null),
    },
  });

  ensureLayer(map, {
    id: LAYER.riskNoTravel,
    type: "line",
    source: SOURCE.riskSegments,
    filter: ["==", ["get", "level"], "NO_TRAVEL"],
    layout: { "line-join": "round", "line-cap": "butt" },
    paint: {
      "line-color": riskColorMatch(),
      "line-width": routeWidthExpr(null, null),
      "line-opacity": routeOpacityExpr(null, null),
      "line-dasharray": [1.2, 1.2],
    },
  });

  ensureLayer(map, {
    id: LAYER.riskUnknown,
    type: "line",
    source: SOURCE.riskSegments,
    filter: ["==", ["get", "level"], "UNKNOWN"],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#64748b",
      "line-width": routeWidthExpr(null, null),
      "line-opacity": routeOpacityExpr(null, null),
      "line-dasharray": [0.5, 2],
    },
  });

  ensureLayer(map, {
    id: LAYER.riskHover,
    type: "line",
    source: SOURCE.riskSegments,
    filter: ["==", ["get", "checkpointIndex"], -1],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-width": 9,
      "line-opacity": 0.35,
    },
  });

  ensureLayer(map, {
    id: LAYER.checkpoints,
    type: "circle",
    source: SOURCE.checkpoints,
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "level"], "NO_TRAVEL"],
        8,
        6,
      ],
      "circle-color": riskColorMatch(),
      "circle-stroke-width": [
        "case",
        ["==", ["get", "level"], "NO_TRAVEL"],
        3,
        ["==", ["get", "level"], "UNKNOWN"],
        2.5,
        1.5,
      ],
      "circle-stroke-color": [
        "case",
        ["==", ["get", "level"], "NO_TRAVEL"],
        "#ffffff",
        ["==", ["get", "level"], "UNKNOWN"],
        "#94a3b8",
        "#0b1e26",
      ],
    },
  });

  if (map.getStyle()?.glyphs) {
    ensureLayer(map, {
      id: LAYER.checkpointLabels,
      type: "symbol",
      source: SOURCE.checkpoints,
      minzoom: 7,
      layout: {
        "text-field": [
          "concat",
          ["to-string", ["round", ["get", "mile"]]],
          " mi",
        ],
        "text-size": 11,
        "text-offset": [0, 1.2],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#e8f1f4",
        "text-halo-color": "#061419",
        "text-halo-width": 1.2,
      },
    });
  }

  ensureHeatLayers(map);
}

export function applyRouteEmphasis(
  map: MapboxMap,
  selectedId: string | null,
  hoveredId: string | null,
): void {
  const width = routeWidthExpr(selectedId, hoveredId);
  const opacity = routeOpacityExpr(selectedId, hoveredId);
  for (const id of [
    LAYER.routesBase,
    LAYER.riskSolid,
    LAYER.riskNoTravel,
    LAYER.riskUnknown,
  ]) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, "line-width", width);
    map.setPaintProperty(id, "line-opacity", opacity);
  }
  // Keep selected route visually on top by moving its layers — reorder via filter sort not available;
  // bump casing width for selected.
  if (map.getLayer(LAYER.routesCasing)) {
    map.setPaintProperty(LAYER.routesCasing, "line-width", [
      "case",
      ["==", ["get", "routeId"], selectedId ?? ""],
      12,
      ["==", ["get", "routeId"], hoveredId ?? ""],
      10,
      8,
    ]);
  }
}

export function setHoverSegmentFilter(
  map: MapboxMap,
  routeId: string | null,
  checkpointIndex: number | null,
): void {
  if (!map.getLayer(LAYER.riskHover)) return;
  if (routeId == null || checkpointIndex == null) {
    map.setFilter(LAYER.riskHover, ["==", ["get", "checkpointIndex"], -1]);
    return;
  }
  map.setFilter(LAYER.riskHover, [
    "all",
    ["==", ["get", "routeId"], routeId],
    ["==", ["get", "checkpointIndex"], checkpointIndex],
  ]);
}

export function supportsLineTrimOffset(map: MapboxMap): boolean {
  try {
    if (!map.getLayer(LAYER.routesBase)) return false;
    map.setPaintProperty(LAYER.routesBase, "line-trim-offset", [0, 0]);
    return true;
  } catch {
    return false;
  }
}
