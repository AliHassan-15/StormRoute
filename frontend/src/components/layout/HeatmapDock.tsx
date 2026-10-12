import { Eye, EyeOff, Pause, Play, RotateCcw } from "lucide-react";
import * as React from "react";

import { HeatmapSlider } from "@/components/layout/HeatmapSlider";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useHeatmapFetch } from "@/hooks/useHeatmapFetch";
import { applyLayerHKeys } from "@/lib/heatmap/geojson";
import { LAYER_LEGEND, type HeatLayerKey } from "@/lib/heatmap/normalize";
import { formatHeatmapTimeLabel, frameUtcMs } from "@/lib/heatmap/timeLabel";
import {
  isTruckVisible,
  truckPositionAtTime,
} from "@/lib/heatmap/truckPosition";
import { Z_MAP_OVERLAY } from "@/lib/constants";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useHeatmapStore, type HeatmapSpeed } from "@/store/heatmapStore";
import { useResultsStore } from "@/store/resultsStore";
import { useViewStore } from "@/store/viewStore";

const LAYER_OPTIONS: { value: HeatLayerKey; label: string }[] = [
  { value: "wind", label: "Wind" },
  { value: "rain", label: "Rain" },
  { value: "snow", label: "Snow" },
  { value: "risk", label: "Overall risk" },
];
const SPEED_OPTIONS: HeatmapSpeed[] = [1, 2, 4];

function mapController() {
  return typeof window !== "undefined" ? window.__mapController : undefined;
}

function frameUnavailable(
  data: { points: Array<{ wind: Array<number | null> }> },
  hour: number,
): boolean {
  if (!data.points.length) return true;
  return data.points.every((p) => p.wind[hour] == null);
}

export function HeatmapDock() {
  const analyze = useResultsStore((s) => s.data);
  const selectedRouteId = useViewStore((s) => s.selectedRouteId);
  const { load, geoRef, status } = useHeatmapFetch();

  const error = useHeatmapStore((s) => s.error);
  const data = useHeatmapStore((s) => s.data);
  const hour = useHeatmapStore((s) => s.hour);
  const layer = useHeatmapStore((s) => s.layer);
  const playing = useHeatmapStore((s) => s.playing);
  const speed = useHeatmapStore((s) => s.speed);
  const visible = useHeatmapStore((s) => s.visible);
  const setHour = useHeatmapStore((s) => s.setHour);
  const setLayer = useHeatmapStore((s) => s.setLayer);
  const setPlaying = useHeatmapStore((s) => s.setPlaying);
  const setSpeed = useHeatmapStore((s) => s.setSpeed);
  const setVisible = useHeatmapStore((s) => s.setVisible);

  React.useEffect(() => {
    if (status !== "ready" || !geoRef.current) return;
    applyLayerHKeys(geoRef.current, layer);
    mapController()?.setHeatmapGeoJson(geoRef.current);
    mapController()?.setHeatmapFrame(
      layer,
      useHeatmapStore.getState().hour,
    );
  }, [layer, status, geoRef]);

  React.useEffect(() => {
    if (status !== "ready" || !data) return;
    mapController()?.setHeatmapFrame(layer, hour);
  }, [hour, layer, status, data]);

  React.useEffect(() => {
    mapController()?.setHeatmapVisible(visible);
  }, [visible]);

  const selectedRoute = analyze?.routes.find((r) => r.id === selectedRouteId);

  /** Forecast-hour when the truck arrives (end of trip). Playback stops here. */
  const arrivalHour = React.useMemo(() => {
    if (!data || !selectedRoute) return null;
    const t0 = Date.parse(data.t0_utc);
    if (!Number.isFinite(t0)) return null;
    let arrivalMs = selectedRoute.arrival_utc
      ? Date.parse(selectedRoute.arrival_utc)
      : NaN;
    if (!Number.isFinite(arrivalMs)) {
      const last = selectedRoute.checkpoints[selectedRoute.checkpoints.length - 1];
      if (last) arrivalMs = Date.parse(last.eta_utc);
    }
    if (!Number.isFinite(arrivalMs)) return null;
    const h = (arrivalMs - t0) / 3_600_000;
    if (h < 0) return 0;
    return Math.min(48, h);
  }, [data, selectedRoute]);

  /** Fractional playhead while playing; when paused, UI follows integer `hour`. */
  const playheadRef = React.useRef(hour);
  const [playheadHour, setPlayheadHour] = React.useState(hour);
  const displayPlayhead = playing ? playheadHour : hour;

  const placeTruckAtHour = React.useCallback(
    (hourValue: number, smooth: boolean) => {
      if (!analyze || !selectedRoute || !data || status !== "ready") {
        mapController()?.setTruckPosition(null);
        return;
      }
      const atMs = frameUtcMs(data.t0_utc, hourValue);
      if (!isTruckVisible(selectedRoute.checkpoints, atMs)) {
        mapController()?.setTruckPosition(null);
        return;
      }
      const pos = truckPositionAtTime(
        selectedRoute.checkpoints,
        {
          origin: analyze.input.origin,
          destination: analyze.input.destination,
        },
        atMs,
        {
          coordinates: selectedRoute.geometry.coordinates,
          distance_mi: selectedRoute.distance_mi,
        },
      );
      mapController()?.setTruckPosition(pos, {
        // Continuous playback updates every frame — never ease between frames.
        ease: smooth && !playing && !prefersReducedMotion(),
      });
    },
    [analyze, selectedRoute, data, status, playing],
  );

  // Scrubbing / paused: keep playhead ref aligned and snap truck to the hour.
  React.useEffect(() => {
    if (playing) return;
    playheadRef.current = hour;
    placeTruckAtHour(hour, true);
  }, [playing, hour, placeTruckAtHour]);

  // Playing: advance a fractional playhead with rAF so the truck glides
  // along the route at 1x / 2x / 4x forecast-hours per wall-clock second.
  // Stop when the playhead reaches destination arrival from before it;
  // if already past arrival (scrubbing the forecast), play through to 48h.
  React.useEffect(() => {
    if (!playing || status !== "ready") return;
    const arrival = arrivalHour ?? 48;
    const startAt = playheadRef.current;
    const stopAt =
      startAt < arrival ? arrival : 48;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      let next = playheadRef.current + dt * speed;
      if (next >= stopAt) {
        next = stopAt;
        playheadRef.current = next;
        setPlayheadHour(next);
        setHour(Math.min(48, Math.round(next)));
        placeTruckAtHour(next, false);
        setPlaying(false);
        return;
      }
      playheadRef.current = next;
      placeTruckAtHour(next, false);
      if (now - lastUi >= 48) {
        lastUi = now;
        setPlayheadHour(next);
        const floored = Math.floor(next);
        if (floored !== useHeatmapStore.getState().hour) {
          setHour(floored);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [
    playing,
    speed,
    status,
    arrivalHour,
    setHour,
    setPlaying,
    placeTruckAtHour,
  ]);

  if (!analyze) return null;

  const timeLabel = data
    ? formatHeatmapTimeLabel(data.t0_utc, displayPlayhead)
    : "—";
  const unavailable =
    status === "ready" && data ? frameUnavailable(data, hour) : false;
  const legend = LAYER_LEGEND[layer];

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3 md:bottom-6"
      style={{ zIndex: Z_MAP_OVERLAY }}
    >
      <GlassPanel
        className="pointer-events-auto w-full max-w-3xl px-3 py-3 md:px-4"
        data-testid="heatmap-dock"
        role="region"
        aria-label="Forecast heatmap controls"
      >
        {status === "loading" || status === "idle" ? (
          <div
            className="flex flex-col gap-2"
            data-testid="heatmap-dock-skeleton"
          >
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : status === "error" ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2"
            data-testid="heatmap-dock-error"
          >
            <p className="text-sm text-destructive">
              {error ?? "Heatmap failed."}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void load()}
              data-testid="heatmap-retry"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                value={layer}
                onValueChange={(v) => setLayer(v)}
                options={LAYER_OPTIONS}
                ariaLabel="Heatmap layer"
                className="flex-wrap"
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={visible ? "Hide heatmap" : "Show heatmap"}
                  data-testid="heatmap-visibility"
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? (
                    <Eye className="size-4" aria-hidden />
                  ) : (
                    <EyeOff className="size-4" aria-hidden />
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-label={playing ? "Pause" : "Play"}
                  data-testid="heatmap-play"
                  onClick={() => {
                    if (!playing) {
                      playheadRef.current = hour;
                      setPlayheadHour(hour);
                    }
                    setPlaying(!playing);
                  }}
                >
                  {playing ? (
                    <Pause className="size-3.5" aria-hidden />
                  ) : (
                    <Play className="size-3.5" aria-hidden />
                  )}
                </Button>
                <div
                  className="inline-flex rounded-[var(--radius-control)] border border-border p-0.5"
                  role="group"
                  aria-label="Playback speed"
                >
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={cn(
                        "rounded-[6px] px-2 py-1 font-mono text-xs tabular-nums",
                        speed === s
                          ? "bg-surface text-text"
                          : "text-text-muted hover:text-text",
                      )}
                      aria-pressed={speed === s}
                      onClick={() => setSpeed(s)}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <p
                className="font-mono text-sm tabular-nums text-text"
                data-testid="heatmap-time-label"
              >
                {timeLabel}
              </p>
              {unavailable ? (
                <p
                  className="text-xs text-text-muted"
                  data-testid="heatmap-unavailable"
                >
                  Forecast unavailable for this hour
                </p>
              ) : null}
            </div>

            <HeatmapSlider
              hour={hour}
              t0Utc={data?.t0_utc ?? null}
              arrivalHour={arrivalHour}
              playing={playing}
              onHourChange={(h) => {
                setPlaying(false);
                setHour(h);
              }}
              onTogglePlay={() => setPlaying(!playing)}
            />

            <div
              className="flex items-center gap-2"
              data-testid="heatmap-legend"
              aria-label={`${layer} relative intensity`}
            >
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-muted">
                Intensity ({legend.unit})
              </span>
              <div
                className="h-2 flex-1 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #22c55e, #eab308, #f97316, #ef4444, #d946ef)",
                }}
              />
              <div className="flex gap-1.5 font-mono text-[10px] tabular-nums text-text-muted">
                {legend.stops.map((s) => (
                  <span key={s.label}>{s.label}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
