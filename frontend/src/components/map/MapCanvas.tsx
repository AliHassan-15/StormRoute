import type { Map as MapboxMap } from "mapbox-gl";
import * as React from "react";

import { MapControls } from "@/components/map/MapControls";
import { MapFallback } from "@/components/map/MapFallback";
import { MapLegend } from "@/components/map/MapLegend";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/lib/env";
import {
  createMapController,
  type MapController,
  type MapTheme,
} from "@/map/mapController";
import { useResultsStore } from "@/store/resultsStore";
import { useUiStore } from "@/store/uiStore";

declare global {
  interface Window {
    __map?: MapboxMap;
    __mapController?: MapController;
  }
}

function webglSupported(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

function tokenLooksValid(token: string): boolean {
  return (
    Boolean(token) &&
    !token.includes("your_mapbox") &&
    !token.includes("e2e-blank") &&
    token.startsWith("pk.") &&
    token.length > 40
  );
}

function isE2eClient(): boolean {
  if (typeof window === "undefined") return false;
  // Prefer build/runtime e2e flags. Do not treat a leftover localStorage key
  // from Playwright as e2e during normal `npm run dev` (that blanks the map).
  if (import.meta.env.VITE_E2E === "1" || import.meta.env.MODE === "e2e") {
    return true;
  }
  try {
    if (new URLSearchParams(window.location.search).get("e2e") === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function resolveBootStatus(): "loading" | "webgl" | "token" {
  if (typeof window === "undefined") return "loading";
  if (!webglSupported()) return "webgl";
  if (!tokenLooksValid(env.VITE_MAPBOX_TOKEN) && !isE2eClient()) return "token";
  return "loading";
}

/** Full-bleed Mapbox canvas — map instance created once. */
export function MapCanvas() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const controllerRef = React.useRef<MapController | null>(null);
  const [status, setStatus] = React.useState<
    "loading" | "ready" | "webgl" | "token" | "error"
  >(resolveBootStatus);
  const data = useResultsStore((s) => s.data);
  const resolvedTheme = useUiStore((s) => s.resolvedTheme);
  const e2e = typeof window !== "undefined" && isE2eClient();

  React.useEffect(() => {
    if (status !== "loading") return;

    let cancelled = false;
    let onWinResize: (() => void) | null = null;

    void (async () => {
      try {
        // Ensure the container has committed before creating the map.
        await Promise.resolve();
        if (cancelled || !containerRef.current) return;

        const mapboxgl = (await import("mapbox-gl")).default;
        await import("mapbox-gl/dist/mapbox-gl.css");
        if (cancelled || !containerRef.current) return;

        const theme: MapTheme =
          resolvedTheme === "light" ? "light" : "dark";
        // E2E always uses the offline blank style so parallel workers never
        // depend on Mapbox network/token validity.
        const blankStyle = e2e || !tokenLooksValid(env.VITE_MAPBOX_TOKEN);
        const controller = createMapController(
          mapboxgl,
          containerRef.current,
          env.VITE_MAPBOX_TOKEN || "pk.e2e",
          theme,
          { blankStyle },
        );
        controllerRef.current = controller;

        // Heatmap dock and tests reach the live controller via window.
        window.__map = controller.map;
        window.__mapController = controller;

        const markReady = () => {
          if (cancelled) return;
          // Container may lay out after mount; force a resize so tiles paint.
          controller.map.resize();
          setStatus("ready");
        };
        // Prefer style/load signals — blank e2e styles can miss `loaded()`.
        if (controller.map.isStyleLoaded() || controller.map.loaded()) {
          markReady();
        } else {
          controller.map.once("load", markReady);
          controller.map.once("idle", markReady);
        }

        if (cancelled) {
          controller.destroy();
          controllerRef.current = null;
          return;
        }
        onWinResize = () => controller.map.resize();
        window.addEventListener("resize", onWinResize);

        if (!blankStyle) {
          controller.map.on("error", (e) => {
            const msg = String(e.error?.message ?? e.error ?? "");
            if (/token|unauthorized|401|403/i.test(msg)) {
              setStatus("token");
            }
          });
        }

        const current = useResultsStore.getState().data;
        if (current) controller.setAnalyzeData(current);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (onWinResize) {
        window.removeEventListener("resize", onWinResize);
      }
      // Only tear down on unmount — not when status flips to ready.
      controllerRef.current?.destroy();
      controllerRef.current = null;
      delete window.__map;
      delete window.__mapController;
    };
    // Mount-only: do not depend on `status` or cleanup will destroy a live map.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  React.useEffect(() => {
    controllerRef.current?.setAnalyzeData(data);
  }, [data]);

  React.useEffect(() => {
    const theme: MapTheme = resolvedTheme === "light" ? "light" : "dark";
    controllerRef.current?.setTheme(theme);
  }, [resolvedTheme]);

  const ctrl = () => controllerRef.current;

  return (
    <div
      className="absolute inset-0"
      data-testid="map-canvas-root"
      data-map-status={status}
    >
      {(status === "loading" || status === "ready") && (
        // Mapbox sets `.mapboxgl-map { position: relative }`, which cancels
        // Tailwind `absolute inset-0` and collapses height to 0 (blank map).
        // Fill the absolutely-positioned parent with h/w 100% instead.
        <div
          ref={containerRef}
          className="h-full w-full"
          data-testid="map-canvas"
          aria-label="Route map"
        />
      )}
      {status === "loading" ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-bg/80"
          data-testid="map-skeleton"
        >
          <div className="w-full max-w-sm space-y-3 px-6">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ) : null}
      {status === "webgl" ? <MapFallback reason="webgl" /> : null}
      {status === "token" ? <MapFallback reason="token" /> : null}
      {status === "error" ? <MapFallback reason="error" /> : null}
      {status === "ready" ? (
        <>
          <MapControls
            onZoomIn={() => ctrl()?.map.zoomIn()}
            onZoomOut={() => ctrl()?.map.zoomOut()}
            onRecenter={() => ctrl()?.fitAll()}
            onFullscreen={() => {
              const root = document.documentElement;
              if (!document.fullscreenElement) {
                void root.requestFullscreen?.();
              } else {
                void document.exitFullscreen?.();
              }
            }}
          />
          <MapLegend />
        </>
      ) : null}
    </div>
  );
}
