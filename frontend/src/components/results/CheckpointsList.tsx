import type { AnalyzeRoute } from "@/api/schemas";
import { RiskBadge } from "@/components/ui/risk-badge";
import { formatLocalTime, formatMiles } from "@/lib/format";
import type { RiskLevel } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { useViewStore } from "@/store/viewStore";

export function CheckpointsList({
  route,
  departureLocal,
}: {
  route: AnalyzeRoute;
  departureLocal?: string | null;
}) {
  const selected = useViewStore((s) => s.selectedCheckpointIndex);
  const openCheckpoint = useViewStore((s) => s.openCheckpoint);

  return (
    <ul className="space-y-1.5" aria-label={`Checkpoints for ${route.label}`}>
      {route.checkpoints.map((cp) => {
        const unknown =
          cp.weather_status !== "ok" || cp.level_name === "UNKNOWN";
        const level = (
          unknown ? "UNKNOWN" : (cp.level_name as RiskLevel)
        );
        return (
          <li key={cp.index}>
            <button
              type="button"
              className={cn(
                "flex w-full items-start gap-2 rounded-[var(--radius-control)] border border-transparent px-2 py-2 text-left hover:bg-surface-raised",
                selected === cp.index && "border-accent bg-accent/10",
              )}
              onClick={() => openCheckpoint(cp.index)}
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs tabular-nums text-text">
                  {formatMiles(cp.mile, 0)} ·{" "}
                  {formatLocalTime(cp.eta_local, { departureLocal })}
                </p>
                {unknown ? (
                  <p className="text-xs text-text-muted">No forecast</p>
                ) : (
                  <p className="font-mono text-[11px] tabular-nums text-text-muted">
                    W {cp.weather?.wind_mph?.toFixed(0) ?? "—"} · R{" "}
                    {cp.weather?.rain_in_hr?.toFixed(2) ?? "—"} · S{" "}
                    {cp.weather?.snow_in_hr?.toFixed(2) ?? "—"}
                  </p>
                )}
              </div>
              <RiskBadge level={level} className="shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
