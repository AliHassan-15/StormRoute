import type { AnalyzeResponse, AnalyzeRoute } from "@/api/schemas";
import {
  formatAvgRisk,
  formatDelta,
  formatDuration,
  formatMiles,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type MetricKey =
  | "distance_mi"
  | "duration_s"
  | "delay_vs_fastest_s"
  | "severe_miles"
  | "high_miles"
  | "avg_risk"
  | "no_travel_miles";

const ROWS: { key: MetricKey; label: string; lowerIsBetter: boolean }[] = [
  { key: "distance_mi", label: "Distance", lowerIsBetter: true },
  { key: "duration_s", label: "Duration", lowerIsBetter: true },
  { key: "delay_vs_fastest_s", label: "vs fastest", lowerIsBetter: true },
  { key: "severe_miles", label: "Severe mi", lowerIsBetter: true },
  { key: "high_miles", label: "High mi", lowerIsBetter: true },
  { key: "no_travel_miles", label: "No Travel mi", lowerIsBetter: true },
  { key: "avg_risk", label: "Avg risk", lowerIsBetter: true },
];

function metricValue(route: AnalyzeRoute, key: MetricKey): number | null {
  if (key === "avg_risk") return route.metrics.avg_risk;
  if (key === "severe_miles") return route.metrics.severe_miles;
  if (key === "high_miles") return route.metrics.high_miles;
  if (key === "no_travel_miles") return route.metrics.no_travel_miles;
  return route[key];
}

function formatMetric(route: AnalyzeRoute, key: MetricKey): string {
  const v = metricValue(route, key);
  if (key === "distance_mi") return formatMiles(route.distance_mi);
  if (key === "duration_s") return formatDuration(route.duration_s);
  if (key === "delay_vs_fastest_s") return formatDelta(route.delay_vs_fastest_s);
  if (key === "avg_risk") return formatAvgRisk(v);
  return formatMiles(v ?? 0, 0);
}

export function CompareTable({ data }: { data: AnalyzeResponse }) {
  const routes = [...data.routes].sort((a, b) => a.rank - b.rank);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-text-muted">Metric</th>
            {routes.map((r) => (
              <th
                key={r.id}
                className={cn(
                  "px-2 py-1.5 text-left font-medium",
                  r.is_recommended ? "text-accent" : "text-text-muted",
                )}
              >
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const values = routes.map((r) => metricValue(r, row.key));
            const numeric = values.filter((v): v is number => v != null && Number.isFinite(v));
            const best = numeric.length
              ? row.lowerIsBetter
                ? Math.min(...numeric)
                : Math.max(...numeric)
              : null;
            return (
              <tr key={row.key} className="border-t border-border/60">
                <td className="px-2 py-1.5 text-text-muted">{row.label}</td>
                {routes.map((r, i) => {
                  const v = values[i];
                  const isBest =
                    best != null && v != null && Math.abs(v - best) < 1e-9;
                  return (
                    <td
                      key={r.id}
                      className={cn(
                        "px-2 py-1.5 font-mono tabular-nums",
                        isBest && "font-semibold text-accent",
                      )}
                    >
                      {formatMetric(r, row.key)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
