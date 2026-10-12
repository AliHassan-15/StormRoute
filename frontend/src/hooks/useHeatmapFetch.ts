import * as React from "react";

import { ApiError } from "@/api/errors";
import { fetchHeatmap } from "@/api/hooks";
import {
  applyLayerHKeys,
  heatmapToGeoJson,
} from "@/lib/heatmap/geojson";
import { useHeatmapStore } from "@/store/heatmapStore";
import { usePlanStore } from "@/store/planStore";
import { useResultsStore } from "@/store/resultsStore";

function mapController() {
  return typeof window !== "undefined" ? window.__mapController : undefined;
}

/** Non-blocking heatmap fetch after a successful analyze. */
export function useHeatmapFetch() {
  const analyze = useResultsStore((s) => s.data);
  const origin = usePlanStore((s) => s.origin);
  const destination = usePlanStore((s) => s.destination);
  const departure = usePlanStore((s) => s.departure);
  const loadLb = usePlanStore((s) => s.loadLb);

  const status = useHeatmapStore((s) => s.status);
  const setStatus = useHeatmapStore((s) => s.setStatus);
  const setData = useHeatmapStore((s) => s.setData);
  const reset = useHeatmapStore((s) => s.reset);

  const geoRef = React.useRef<GeoJSON.FeatureCollection | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const requestIdRef = React.useRef<string | null>(null);

  const load = React.useCallback(async () => {
    if (!analyze || !origin || !destination || !departure) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus("loading");
    try {
      // Brief pause so analyze's Open-Meteo burst can settle (avoids 400/502).
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 500);
      });
      if (ac.signal.aborted) return;
      const payload = await fetchHeatmap(
        {
          origin,
          destination,
          departure_time: departure,
          load_lb: loadLb,
        },
        ac.signal,
      );
      if (ac.signal.aborted) return;
      setData(payload);
      const activeLayer = useHeatmapStore.getState().layer;
      const geo = applyLayerHKeys(heatmapToGeoJson(payload), activeLayer);
      geoRef.current = geo;
      const mapCtrl = mapController();
      mapCtrl?.setHeatmapGeoJson(geo);
      mapCtrl?.setHeatmapFrame(activeLayer, 0);
      mapCtrl?.setHeatmapVisible(useHeatmapStore.getState().visible);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ABORT") return;
      if (ac.signal.aborted) return;
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not load forecast heatmap.";
      setStatus("error", message);
    }
  }, [analyze, origin, destination, departure, loadLb, setData, setStatus]);

  React.useEffect(() => {
    if (!analyze) {
      reset();
      geoRef.current = null;
      mapController()?.setHeatmapGeoJson(null);
      mapController()?.setTruckPosition(null);
      requestIdRef.current = null;
      return;
    }
    if (requestIdRef.current === analyze.request_id) return;
    requestIdRef.current = analyze.request_id;
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [analyze, load, reset]);

  return { load, geoRef, status };
}
