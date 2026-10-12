import bbox from "@turf/bbox";
import { lineString } from "@turf/helpers";
import type { LngLatBoundsLike, Map as MapboxMap } from "mapbox-gl";

import type { AnalyzeRoute } from "@/api/schemas";
import { prefersReducedMotion } from "@/lib/motion";

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Measure UI chrome so fitBounds leaves routes visible. Units: CSS pixels. */
export function measureMapPadding(): MapPadding {
  // Sidebar is a sibling column of the map stage — do not pad for its width.
  const dock = document.querySelector<HTMLElement>("[data-testid='heatmap-dock']");
  const toolbar = document.querySelector<HTMLElement>("[data-testid='top-toolbar']");
  const stage = document.querySelector<HTMLElement>("[data-testid='map-stage']");
  const drawer = document.querySelector<HTMLElement>("[data-testid='checkpoint-drawer']");
  const stageRect = stage?.getBoundingClientRect();
  const stageBottom = stageRect?.bottom ?? window.innerHeight;
  const stageTop = stageRect?.top ?? 0;
  const bottom = dock
    ? stageBottom - dock.getBoundingClientRect().top + 12
    : 96;
  const top = toolbar
    ? Math.max(16, toolbar.getBoundingClientRect().bottom - stageTop + 12)
    : 72;
  const right =
    drawer && stageRect
      ? Math.max(24, stageRect.right - drawer.getBoundingClientRect().left + 16)
      : 24;
  return {
    top,
    right,
    bottom: Math.max(96, bottom),
    left: 56,
  };
}

export function routesBounds(routes: AnalyzeRoute[]): LngLatBoundsLike | null {
  const coords: [number, number][] = [];
  for (const route of routes) {
    for (const c of route.geometry.coordinates) {
      coords.push([c[0], c[1]]);
    }
  }
  if (coords.length < 2) return null;
  const [minX, minY, maxX, maxY] = bbox(lineString(coords));
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

/** Run `fn` once the map style is ready to accept camera/layer ops. */
export function whenMapReady(map: MapboxMap, fn: () => void): void {
  if (map.isStyleLoaded()) {
    fn();
    return;
  }
  const run = () => {
    if (!map.isStyleLoaded()) return;
    map.off("idle", run);
    map.off("style.load", run);
    fn();
  };
  map.on("idle", run);
  map.once("style.load", run);
}

export function fitRoutes(
  map: MapboxMap,
  routes: AnalyzeRoute[],
  options?: { animate?: boolean },
): void {
  const bounds = routesBounds(routes);
  if (!bounds) return;
  map.resize();
  const padding = measureMapPadding();
  const animate = options?.animate !== false && !prefersReducedMotion();
  try {
    map.fitBounds(bounds, {
      padding,
      duration: animate ? 900 : 0,
      maxZoom: 8,
      essential: true,
    });
  } catch {
    // Container may be 0×0 briefly during layout; retry next frame.
    requestAnimationFrame(() => {
      map.resize();
      try {
        map.fitBounds(bounds, {
          padding: measureMapPadding(),
          duration: 0,
          maxZoom: 8,
          essential: true,
        });
      } catch {
        /* ignore */
      }
    });
  }
}

/** Ease camera to a checkpoint / point with chrome-aware padding. */
export function focusLngLat(
  map: MapboxMap,
  lng: number,
  lat: number,
  options?: { zoom?: number; animate?: boolean },
): void {
  map.resize();
  const padding = measureMapPadding();
  const animate = options?.animate !== false && !prefersReducedMotion();
  const targetZoom = options?.zoom ?? Math.max(map.getZoom(), 7);
  map.easeTo({
    center: [lng, lat],
    zoom: Math.min(targetZoom, 10),
    padding,
    duration: animate ? 650 : 0,
    essential: true,
  });
}

/** True when most of the route bbox is outside the current viewport. */
export function routeMostlyOutOfView(
  map: MapboxMap,
  route: AnalyzeRoute,
): boolean {
  const b = routesBounds([route]);
  if (!b) return true;
  const [[west, south], [east, north]] = b as [
    [number, number],
    [number, number],
  ];
  const visible = map.getBounds();
  if (!visible) return true;
  const overlapW = Math.max(
    0,
    Math.min(east, visible.getEast()) - Math.max(west, visible.getWest()),
  );
  const overlapH = Math.max(
    0,
    Math.min(north, visible.getNorth()) - Math.max(south, visible.getSouth()),
  );
  const routeW = Math.max(east - west, 1e-9);
  const routeH = Math.max(north - south, 1e-9);
  const coverage = (overlapW / routeW) * (overlapH / routeH);
  return coverage < 0.35;
}
