import { RISK_SWATCH_CLASS, type RiskLevel } from "@/lib/risk";
import {
  RISK_BAR_ORDER,
  riskBarLabel,
  riskBarProportions,
  type MilesByLevel,
} from "@/lib/riskBar";
import { cn } from "@/lib/utils";

export interface RiskBarProps {
  miles: MilesByLevel;
  className?: string;
}

export function RiskBar({ miles, className }: RiskBarProps) {
  const proportions = riskBarProportions(miles);
  const label = riskBarLabel(miles);
  const hasAny = RISK_BAR_ORDER.some((k) => (miles[k] ?? 0) > 0);

  return (
    <div
      className={cn("w-full", className)}
      role="img"
      aria-label={label}
      title={label}
    >
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-raised">
        {hasAny
          ? RISK_BAR_ORDER.map((level: RiskLevel) => {
              const pct = proportions[level];
              if (pct <= 0) return null;
              return (
                <span
                  key={level}
                  className={cn(
                    "h-full",
                    RISK_SWATCH_CLASS[level],
                    level === "UNKNOWN" &&
                      "bg-[repeating-linear-gradient(135deg,var(--color-border)_0_3px,transparent_3px_6px)]",
                  )}
                  style={{ width: `${pct}%` }}
                />
              );
            })
          : (
            <span className="h-full w-full bg-border/40" />
          )}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
