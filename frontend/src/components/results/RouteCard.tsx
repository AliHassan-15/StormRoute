import { motion } from "framer-motion";

import type { AnalyzeRoute } from "@/api/schemas";
import { CountUpValue } from "@/components/results/CountUpValue";
import { RiskBar } from "@/components/results/RiskBar";
import { RouteTimeline } from "@/components/results/RouteTimeline";
import { RiskBadge } from "@/components/ui/risk-badge";
import {
  formatAvgRisk,
  formatDelta,
  formatDuration,
  formatLocalTime,
  formatMiles,
} from "@/lib/format";
import { cardSpring, motionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface RouteCardProps {
  route: AnalyzeRoute;
  selected: boolean;
  departureLocal?: string | null;
  onSelect: () => void;
  onHover: (hover: boolean) => void;
  index: number;
}

export function RouteCard({
  route,
  selected,
  departureLocal,
  onSelect,
  onHover,
  index,
}: RouteCardProps) {
  const worst = (route.metrics.worst_level ?? "UNKNOWN");
  const e2e =
    typeof window !== "undefined" &&
    (import.meta.env.VITE_E2E === "1" ||
      import.meta.env.MODE === "e2e" ||
      new URLSearchParams(window.location.search).get("e2e") === "1");

  return (
    <motion.div
      layout={!e2e}
      initial={e2e ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionSafe({ ...cardSpring, delay: e2e ? 0 : index * 0.05 })}
    >
      <div
        role="radio"
        aria-checked={selected}
        tabIndex={0}
        className={cn(
          "relative cursor-pointer rounded-[var(--radius-panel)] border border-border bg-surface-raised p-3 outline-none transition-[colors,transform,box-shadow] duration-[var(--duration-hover)] hover:border-border hover:shadow-soft active:scale-[0.995] focus-visible:ring-2 focus-visible:ring-focus-ring",
          selected && "border-accent bg-surface shadow-soft ring-1 ring-accent/40",
        )}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        data-testid={`route-card-${route.id}`}
      >
        {route.is_recommended ? (
          <span className="absolute -top-2 right-3 rounded-full bg-[#065f46] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#ecfdf5]">
            Recommended
          </span>
        ) : null}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-text">Rank {route.rank}</p>
            <h3 className="text-sm font-semibold text-text">{route.label}</h3>
          </div>
          <RiskBadge level={worst} />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text">
          <div>
            <dt className="font-medium">Distance</dt>
            <dd className="font-mono tabular-nums">
              <CountUpValue
                value={route.distance_mi}
                format={(n) => formatMiles(n)}
              />
            </dd>
          </div>
          <div>
            <dt className="font-medium">Duration</dt>
            <dd className="font-mono tabular-nums">
              <CountUpValue
                value={route.duration_s}
                format={(n) => formatDuration(n)}
              />
            </dd>
          </div>
          <div>
            <dt className="font-medium">Arrival</dt>
            <dd className="font-mono tabular-nums">
              {formatLocalTime(route.arrival_local, { departureLocal })}
            </dd>
          </div>
          <div>
            <dt className="font-medium">vs fastest</dt>
            <dd className="font-mono tabular-nums">
              {formatDelta(route.delay_vs_fastest_s)}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Severe</dt>
            <dd className="font-mono tabular-nums">
              <CountUpValue
                value={route.metrics.severe_miles}
                format={(n) => formatMiles(n, 0)}
              />
            </dd>
          </div>
          <div>
            <dt className="font-medium">High</dt>
            <dd className="font-mono tabular-nums">
              <CountUpValue
                value={route.metrics.high_miles}
                format={(n) => formatMiles(n, 0)}
              />
            </dd>
          </div>
        </dl>
        <div className="mt-2 space-y-1">
          <RiskBar miles={route.metrics.miles_by_level} />
          <p className="text-right font-mono text-[11px] tabular-nums text-text">
            avg {formatAvgRisk(route.metrics.avg_risk)}
          </p>
        </div>
        {selected ? <RouteTimeline route={route} /> : null}
      </div>
    </motion.div>
  );
}
