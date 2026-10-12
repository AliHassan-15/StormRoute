import type { CSSProperties } from "react";

import type { AnalyzeRoute } from "@/api/schemas";
import { formatLocalTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RISK_HEX } from "@/map/riskPaint";
import { useViewStore } from "@/store/viewStore";

/** Segmented coverage strip with ETA ticks; hover highlights the map stretch. */
export function RouteTimeline({ route }: { route: AnalyzeRoute }) {
  const setHoveredSegment = useViewStore((s) => s.setHoveredSegmentIndex);
  const distance = route.distance_mi || 1;

  return (
    <div className="mt-3 space-y-1" data-testid={`route-timeline-${route.id}`}>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
        Timeline
      </p>
      <div
        className="flex h-3 overflow-hidden rounded-full border border-border"
        role="img"
        aria-label="Route risk timeline by coverage segment"
      >
        {route.checkpoints.map((cp) => {
          const widthPct =
            ((cp.coverage_to_mi - cp.coverage_from_mi) / distance) * 100;
          const unknown =
            cp.weather_status !== "ok" ||
            cp.level_name === "UNKNOWN" ||
            cp.level == null;
          const level = unknown ? "UNKNOWN" : cp.level_name;
          const color =
            RISK_HEX[level as keyof typeof RISK_HEX] ?? RISK_HEX.UNKNOWN;
          return (
            <div
              key={cp.index}
              title={`${cp.mile.toFixed(0)} mi · ${level}`}
              className={cn(
                "h-full min-w-[2px] border-0 p-0 transition-opacity hover:opacity-90",
                level === "UNKNOWN" && "opacity-70",
                level === "NO_TRAVEL" &&
                  "bg-[repeating-linear-gradient(90deg,var(--c)_0_3px,transparent_3px_6px)]",
              )}
              style={
                {
                  width: `${Math.max(widthPct, 1)}%`,
                  backgroundColor: level === "NO_TRAVEL" ? undefined : color,
                  ["--c" as string]: color,
                } as CSSProperties
              }
              onMouseEnter={() => setHoveredSegment(cp.index)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[10px] tabular-nums text-text-muted">
        {route.checkpoints
          .filter(
            (_, i) =>
              i === 0 || i === route.checkpoints.length - 1 || i % 2 === 0,
          )
          .slice(0, 4)
          .map((cp) => (
            <span key={cp.index}>{formatLocalTime(cp.eta_local)}</span>
          ))}
      </div>
    </div>
  );
}
