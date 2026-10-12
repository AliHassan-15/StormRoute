import type {
  GeoJSONSource,
  Map as MapboxMap,
  MapMouseEvent,
  Marker,
} from "mapbox-gl";
import type mapboxgl from "mapbox-gl";

import type { AnalyzeResponse } from "@/api/schemas";
import { buildCheckpointsGeoJson } from "@/lib/geo/checkpointsGeoJson";
import { buildRiskSegmentsGeoJson } from "@/lib/geo/riskSegments";
import { buildRoutesGeoJson } from "@/lib/geo/routesGeoJson";
import type { HeatLayerKey } from "@/lib/heatmap/normalize";
import { prefersReducedMotion } from "@/lib/motion";
import {
  fitRoutes,
  focusLngLat,
  routeMostlyOutOfView,
  whenMapReady,
} from "@/map/fitBounds";
import {
  setHeatData,
  setHeatHourPaint,
  setHeatVisibility,
} from "@/map/heatLayers";
import { CUSTOM_LAYER_IDS, LAYER, SOURCE } from "@/map/ids";
import {
  applyRouteEmphasis,
  installLayers,
  setHoverSegmentFilter,
  supportsLineTrimOffset,
} from "@/map/installLayers";
import { useViewStore } from "@/store/viewStore";

export type MapTheme = "dark" | "light";

export interface MapController {
  map: MapboxMap;
  setAnalyzeData: (data: AnalyzeResponse | null) => void;
  setTheme: (theme: MapTheme) => void;
  fitAll: () => void;
  focusRoute: (routeId: string) => void;
  focusCheckpoint: (index: number) => void;
  destroy: () => void;
  getCustomLayerIds: () => string[];
  setHeatmapGeoJson: (data: GeoJSON.FeatureCollection | null) => void;
  setHeatmapFrame: (layer: HeatLayerKey, hour: number) => void;
  setHeatmapVisible: (visible: boolean) => void;
  setTruckPosition: (
    pos: { lng: number; lat: number } | null,
    opts?: { ease?: boolean },
  ) => void;
}

type MapboxModule = typeof mapboxgl;

function styleForTheme(theme: MapTheme, blank: boolean): string | mapboxgl.StyleSpecification {
  if (blank) {
    // Offline-friendly style for Playwright when no real Mapbox token is present.
    return {
      version: 8,
      // Local empty glyphs endpoint is not required if we skip symbol layers;
      // include a remote glyphs URL so labels validate when the network allows.
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": theme === "light" ? "#f3f7f8" : "#061419",
          },
        },
      ],
    };
  }
  return theme === "light"
    ? "mapbox://styles/mapbox/light-v11"
    : "mapbox://styles/mapbox/dark-v11";
}

function setSourceData(
  map: MapboxMap,
  id: string,
  data: GeoJSON.FeatureCollection,
): void {
  const src = map.getSource(id);
  if (src && "setData" in src) {
    (src as GeoJSONSource).setData(data);
  }
}

function createOdMarker(
  mb: MapboxModule,
  map: MapboxMap,
  label: "A" | "B",
  lng: number,
  lat: number,
): Marker {
  const el = document.createElement("div");
  el.className = "sr-od-marker";
  el.dataset.od = label;
  el.textContent = label;
  el.setAttribute("aria-label", label === "A" ? "Origin" : "Destination");
  return new mb.Marker({ element: el, anchor: "center" })
    .setLngLat([lng, lat])
    .addTo(map);
}

/**
 * Imperative map controller — hover/select update the map + Zustand
 * without re-rendering React trees on every mousemove.
 */
export function createMapController(
  mb: MapboxModule,
  container: HTMLElement,
  token: string,
  theme: MapTheme,
  options?: { blankStyle?: boolean },
): MapController {
  const blankStyle = Boolean(options?.blankStyle);
  // Prefer a real pk token when present (avoids Mapbox auth revoke). Blank
  // styles still do not load Mapbox tiles; e2e stubs api.mapbox.com in helpers.
  const looksReal =
    Boolean(token) &&
    token.startsWith("pk.") &&
    token.length > 40 &&
    !token.includes("e2e-blank");
  mb.accessToken = looksReal ? token : token || "pk.e2e";

  const map = new mb.Map({
    container,
    style: styleForTheme(theme, blankStyle),
    center: [-98.5, 39.8],
    zoom: 3.2,
    attributionControl: !blankStyle,
    fadeDuration: prefersReducedMotion() ? 0 : 300,
  });

  let analyze: AnalyzeResponse | null = null;
  let markers: Marker[] = [];
  let truckMarker: Marker | null = null;
  let heatHour = 0;
  let heatLayer: HeatLayerKey = "risk";
  let revealed = false;
  let trimSupported: boolean | null = null;
  let truckRaf = 0;

  const popup = new mb.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 12,
    className: "sr-map-popup",
  });

  const heatPopup = new mb.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 10,
    className: "sr-map-popup",
  });

  function ensureTruckMarker(): Marker {
    if (truckMarker) return truckMarker;
    const el = document.createElement("div");
    el.className = "sr-truck-marker";
    el.dataset.testid = "truck-marker";
    el.setAttribute("aria-label", "Truck position at this time");
    el.title = "Truck position at this time";
    el.innerHTML =
      '<span class="sr-truck-marker__dot"></span><span class="sr-truck-marker__label">Truck</span>';
    truckMarker = new mb.Marker({ element: el, anchor: "center" });
    return truckMarker;
  }

  const syncSources = () => {
    if (!map.isStyleLoaded()) return;
    installLayers(map);
    if (!analyze) {
      const empty = { type: "FeatureCollection" as const, features: [] };
      setSourceData(map, SOURCE.routes, empty);
      setSourceData(map, SOURCE.riskSegments, empty);
      setSourceData(map, SOURCE.checkpoints, empty);
      return;
    }
    const view = useViewStore.getState();
    setSourceData(map, SOURCE.routes, buildRoutesGeoJson(analyze.routes));
    setSourceData(
      map,
      SOURCE.riskSegments,
      buildRiskSegmentsGeoJson(analyze.routes),
    );
    setSourceData(
      map,
      SOURCE.checkpoints,
      buildCheckpointsGeoJson(analyze.routes, view.selectedRouteId),
    );
    applyRouteEmphasis(map, view.selectedRouteId, view.hoveredRouteId);
    setHoverSegmentFilter(
      map,
      view.selectedRouteId,
      view.hoveredSegmentIndex,
    );
  };

  const syncMarkers = () => {
    for (const m of markers) m.remove();
    markers = [];
    if (!analyze) return;
    const { origin, destination } = analyze.input;
    markers.push(
      createOdMarker(mb, map, "A", origin.lng, origin.lat),
      createOdMarker(mb, map, "B", destination.lng, destination.lat),
    );
  };

  const clearLineTrim = () => {
    for (const id of [
      LAYER.routesBase,
      LAYER.riskSolid,
      LAYER.riskNoTravel,
      LAYER.riskUnknown,
    ]) {
      if (!map.getLayer(id)) continue;
      try {
        map.setPaintProperty(id, "line-trim-offset", [0, 0]);
      } catch {
        /* style may not support trim */
      }
    }
  };

  const runReveal = () => {
    if (revealed || !analyze) return;
    revealed = true;
    if (trimSupported == null) {
      trimSupported = supportsLineTrimOffset(map);
    }
    const lineLayers = [
      LAYER.routesBase,
      LAYER.riskSolid,
      LAYER.riskNoTravel,
      LAYER.riskUnknown,
    ];
    if (prefersReducedMotion() || !trimSupported) {
      clearLineTrim();
      const view = useViewStore.getState();
      applyRouteEmphasis(map, view.selectedRouteId, view.hoveredRouteId);
      return;
    }
    for (const id of lineLayers) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, "line-trim-offset", [0, 1]);
    }
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const ease = 1 - (1 - t) * (1 - t);
      // Mapbox requires each trim component in [0, 1].
      const trimEnd = Math.min(1, Math.max(0, 1 - ease));
      for (const id of lineLayers) {
        if (!map.getLayer(id)) continue;
        try {
          map.setPaintProperty(id, "line-trim-offset", [0, trimEnd]);
        } catch {
          /* style may not support trim */
        }
      }
      if (t < 1) requestAnimationFrame(tick);
      else clearLineTrim();
    };
    requestAnimationFrame(tick);
  };

  const resolveRoute = (routeId: string | null | undefined) => {
    if (!analyze) return undefined;
    return (
      analyze.routes.find((r) => r.id === routeId) ??
      analyze.routes.find((r) => r.is_recommended) ??
      analyze.routes[0]
    );
  };

  const focusRouteById = (routeId: string) => {
    const route = resolveRoute(routeId);
    if (route) fitRoutes(map, [route]);
  };

  const focusCheckpointByIndex = (index: number) => {
    const route = resolveRoute(useViewStore.getState().selectedRouteId);
    const cp = route?.checkpoints.find((c) => c.index === index);
    if (cp) focusLngLat(map, cp.lng, cp.lat, { zoom: 8 });
  };

  map.on("style.load", () => {
    installLayers(map);
    syncSources();
    syncMarkers();
    const view = useViewStore.getState();
    applyRouteEmphasis(map, view.selectedRouteId, view.hoveredRouteId);
  });

  // After setStyle the previous style.load listener still runs; also re-assert
  // layers when the map becomes idle so e2e theme toggles are deterministic.
  map.on("idle", () => {
    if (!map.getLayer(LAYER.routesBase) && map.isStyleLoaded()) {
      installLayers(map);
      syncSources();
      const view = useViewStore.getState();
      applyRouteEmphasis(map, view.selectedRouteId, view.hoveredRouteId);
    }
  });

  const interactiveLayers = () =>
    [
      LAYER.routesBase,
      LAYER.riskSolid,
      LAYER.riskNoTravel,
      LAYER.riskUnknown,
      LAYER.checkpoints,
      LAYER.heatHit,
    ].filter((id) => Boolean(map.getLayer(id)));

  function parseArrayProp(raw: unknown): Array<number | null> | null {
    if (Array.isArray(raw)) {
      return raw.map((v) => (v == null || v === "" ? null : Number(v)));
    }
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => (v == null ? null : Number(v)));
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  map.on("mousemove", (e: MapMouseEvent) => {
    const feats = map.queryRenderedFeatures(e.point, {
      layers: interactiveLayers(),
    });
    if (!feats.length) {
      if (useViewStore.getState().hoveredRouteId) {
        useViewStore.getState().setHoveredRouteId(null);
      }
      popup.remove();
      heatPopup.remove();
      map.getCanvas().style.cursor = "";
      return;
    }
    map.getCanvas().style.cursor = "pointer";
    const heatFeat = feats.find((f) => f.layer?.id === LAYER.heatHit);
    if (heatFeat) {
      const wind = parseArrayProp(heatFeat.properties?.wind);
      const rain = parseArrayProp(heatFeat.properties?.rain);
      const snow = parseArrayProp(heatFeat.properties?.snow);
      const risk = parseArrayProp(heatFeat.properties?.risk);
      const w = wind?.[heatHour];
      const r = rain?.[heatHour];
      const s = snow?.[heatHour];
      const lv = risk?.[heatHour];
      const unavailable = w == null && r == null && s == null && lv == null;
      const html = unavailable
        ? `<div class="sr-popup">Forecast unavailable for this hour</div>`
        : `<div class="sr-popup"><strong>Hour ${heatHour}</strong><br/>Wind ${w ?? "—"} mph · Rain ${r ?? "—"} in/hr<br/>Snow ${s ?? "—"} in/hr · Level ${lv ?? "—"}</div>`;
      heatPopup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      popup.remove();
      return;
    }
    heatPopup.remove();
    const feat = feats[0]!;
    const routeId = feat.properties?.routeId as string | undefined;
    if (routeId && useViewStore.getState().hoveredRouteId !== routeId) {
      useViewStore.getState().setHoveredRouteId(routeId);
    }
    if (feat.layer?.id === LAYER.checkpoints) {
      const mile = Number(feat.properties?.mile ?? 0);
      const level = String(feat.properties?.level ?? "");
      const eta = String(feat.properties?.eta_local ?? "");
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="sr-popup"><strong>${mile.toFixed(0)} mi</strong> · ${level}<br/><span>${eta}</span></div>`,
        )
        .addTo(map);
    } else {
      popup.remove();
    }
  });

  map.on("click", (e: MapMouseEvent) => {
    const feats = map.queryRenderedFeatures(e.point, {
      layers: interactiveLayers(),
    });
    const cp = feats.find((f) => f.layer?.id === LAYER.checkpoints);
    if (cp) {
      const index = Number(cp.properties?.index);
      if (Number.isFinite(index)) useViewStore.getState().openCheckpoint(index);
      return;
    }
    const line = feats.find((f) => f.properties?.routeId);
    if (line?.properties?.routeId) {
      const id = String(line.properties.routeId);
      const prev = useViewStore.getState().selectedRouteId;
      useViewStore.getState().setSelectedRouteId(id);
      if (analyze && prev !== id) {
        const route = analyze.routes.find((r) => r.id === id);
        if (route && routeMostlyOutOfView(map, route)) {
          fitRoutes(map, [route]);
        }
      }
    }
  });

  const unsub = useViewStore.subscribe((state, prev) => {
    const selectionChanged =
      state.selectedRouteId !== prev.selectedRouteId ||
      state.hoveredRouteId !== prev.hoveredRouteId;
    const routeChanged = state.selectedRouteId !== prev.selectedRouteId;

    whenMapReady(map, () => {
      if (selectionChanged) {
        applyRouteEmphasis(map, state.selectedRouteId, state.hoveredRouteId);
      }
      if (routeChanged && analyze) {
        setSourceData(
          map,
          SOURCE.checkpoints,
          buildCheckpointsGeoJson(analyze.routes, state.selectedRouteId),
        );
        if (state.selectedRouteId) {
          focusRouteById(state.selectedRouteId);
        }
      }
      if (
        state.hoveredSegmentIndex !== prev.hoveredSegmentIndex ||
        routeChanged
      ) {
        setHoverSegmentFilter(
          map,
          state.selectedRouteId,
          state.hoveredSegmentIndex,
        );
      }
    });

    if (
      state.selectedCheckpointIndex !== prev.selectedCheckpointIndex ||
      state.checkpointDrawerOpen !== prev.checkpointDrawerOpen
    ) {
      if (
        state.checkpointDrawerOpen &&
        state.selectedCheckpointIndex != null
      ) {
        // Wait a frame so the drawer is in the DOM for padding measurement.
        requestAnimationFrame(() => {
          whenMapReady(map, () => {
            focusCheckpointByIndex(state.selectedCheckpointIndex!);
          });
        });
      }
    }
  });

  return {
    map,
    setAnalyzeData: (data) => {
      const isNew = data?.request_id !== analyze?.request_id;
      analyze = data;
      if (isNew) revealed = false;
      const paint = () => {
        syncSources();
        syncMarkers();
        if (!data?.routes.length) return;
        map.resize();
        // Two frames: layout (split map stage) then fit.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitRoutes(map, data.routes);
            if (isNew) runReveal();
            else clearLineTrim();
          });
        });
      };
      whenMapReady(map, paint);
    },
    setTheme: (next) => {
      map.setStyle(styleForTheme(next, blankStyle));
    },
    fitAll: () => {
      if (analyze?.routes.length) fitRoutes(map, analyze.routes);
    },
    focusRoute: (routeId) => {
      whenMapReady(map, () => focusRouteById(routeId));
    },
    focusCheckpoint: (index) => {
      whenMapReady(map, () => focusCheckpointByIndex(index));
    },
    destroy: () => {
      unsub();
      popup.remove();
      heatPopup.remove();
      if (truckRaf) cancelAnimationFrame(truckRaf);
      truckMarker?.remove();
      truckMarker = null;
      for (const m of markers) m.remove();
      markers = [];
      map.remove();
    },
    getCustomLayerIds: () =>
      CUSTOM_LAYER_IDS.filter((id) => Boolean(map.getLayer(id))),
    setHeatmapGeoJson: (data) => {
      if (!map.isStyleLoaded()) {
        map.once("style.load", () => {
          setHeatData(
            map,
            data ?? { type: "FeatureCollection", features: [] },
          );
          setHeatHourPaint(map, heatLayer, heatHour);
        });
        return;
      }
      setHeatData(map, data ?? { type: "FeatureCollection", features: [] });
      setHeatHourPaint(map, heatLayer, heatHour);
    },
    setHeatmapFrame: (layer, hour) => {
      heatLayer = layer;
      heatHour = hour;
      requestAnimationFrame(() => {
        setHeatHourPaint(map, layer, hour);
      });
    },
    setHeatmapVisible: (visible) => {
      setHeatVisibility(map, visible);
    },
    setTruckPosition: (pos, opts) => {
      if (truckRaf) {
        cancelAnimationFrame(truckRaf);
        truckRaf = 0;
      }
      if (!pos) {
        truckMarker?.remove();
        return;
      }
      const marker = ensureTruckMarker();
      const ease = opts?.ease !== false && !prefersReducedMotion();
      if (!marker.getElement().isConnected) {
        marker.setLngLat([pos.lng, pos.lat]).addTo(map);
        return;
      }
      if (!ease) {
        marker.setLngLat([pos.lng, pos.lat]);
        if (!marker.getElement().isConnected) marker.addTo(map);
        return;
      }
      const from = marker.getLngLat();
      const start = performance.now();
      const duration = 180;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const u = 1 - (1 - t) * (1 - t);
        marker.setLngLat([
          from.lng + (pos.lng - from.lng) * u,
          from.lat + (pos.lat - from.lat) * u,
        ]);
        if (t < 1) truckRaf = requestAnimationFrame(tick);
      };
      if (!marker.getElement().isConnected) marker.addTo(map);
      truckRaf = requestAnimationFrame(tick);
    },
  };
}
