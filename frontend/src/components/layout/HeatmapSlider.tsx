import * as React from "react";

import { handleHeatmapSliderKey } from "@/lib/heatmap/sliderKeys";
import { formatHeatmapAriaValueText } from "@/lib/heatmap/timeLabel";

export interface HeatmapSliderProps {
  hour: number;
  t0Utc: string | null;
  arrivalHour: number | null;
  playing: boolean;
  onHourChange: (hour: number) => void;
  onTogglePlay: () => void;
}

export function HeatmapSlider({
  hour,
  t0Utc,
  arrivalHour,
  playing,
  onHourChange,
  onTogglePlay,
}: HeatmapSliderProps) {
  const ariaValue = t0Utc
    ? formatHeatmapAriaValueText(t0Utc, hour)
    : `Hour ${hour}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const result = handleHeatmapSliderKey(e.key, e.shiftKey, hour);
    if (result.hour != null) {
      e.preventDefault();
      onHourChange(result.hour);
    }
    if (result.togglePlay) {
      e.preventDefault();
      onTogglePlay();
    }
  };

  return (
    <div className="relative pt-1" onKeyDown={onKeyDown}>
      {arrivalHour != null ? (
        <div
          className="pointer-events-none absolute top-[18px] h-2 rounded-full bg-accent/25"
          style={{ width: `${(arrivalHour / 48) * 100}%` }}
          data-testid="heatmap-trip-band"
          aria-hidden
        />
      ) : null}
      <div
        className="pointer-events-none absolute top-[14px] z-10 size-2 -translate-x-1/2 rounded-full bg-accent"
        style={{ left: "0%" }}
        title="Departure"
        data-testid="heatmap-departure-marker"
        aria-hidden
      />
      {[24, 48].map((h) => (
        <div
          key={h}
          className="pointer-events-none absolute top-0 h-full w-px bg-border"
          style={{ left: `${(h / 48) * 100}%` }}
          aria-hidden
        />
      ))}
      <input
        type="range"
        min={0}
        max={48}
        step={1}
        value={hour}
        aria-valuemin={0}
        aria-valuemax={48}
        aria-valuenow={hour}
        aria-valuetext={ariaValue}
        aria-label="Forecast hour"
        data-testid="heatmap-slider"
        className="relative z-20 h-11 w-full cursor-pointer accent-[var(--color-accent)]"
        onChange={(e) => onHourChange(Number(e.target.value))}
      />
      <div className="mt-0.5 flex justify-between font-mono text-[10px] tabular-nums text-text-muted">
        {[0, 6, 12, 18, 24, 30, 36, 42, 48].map((t) => (
          <span key={t}>{t}h</span>
        ))}
      </div>
      {/* Keep playing in the dependency surface for a11y tooling */}
      <span className="sr-only">{playing ? "Playing" : "Paused"}</span>
    </div>
  );
}
