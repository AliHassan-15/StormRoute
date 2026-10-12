import { AlertTriangle, Ban, CircleHelp, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { RISK_LABELS, RISK_SWATCH_CLASS, type RiskLevel } from "@/lib/risk";
import { cn } from "@/lib/utils";

const ICONS: Record<RiskLevel, LucideIcon> = {
  LOW: ShieldCheck,
  MODERATE: AlertTriangle,
  HIGH: TriangleAlert,
  SEVERE: ShieldAlert,
  NO_TRAVEL: Ban,
  UNKNOWN: CircleHelp,
};

export interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
  showSwatch?: boolean;
}

/** Risk level chip — colour is never used alone (label + icon always present). */
export function RiskBadge({ level, className, showSwatch = true }: RiskBadgeProps) {
  const Icon = ICONS[level];
  const label = RISK_LABELS[level];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-chip)] border border-border bg-surface-raised px-2.5 py-1 text-xs font-medium text-text",
        className,
      )}
      data-risk={level}
    >
      {showSwatch ? (
        <span
          className={cn("size-2.5 shrink-0 rounded-full", RISK_SWATCH_CLASS[level])}
          aria-hidden="true"
        />
      ) : null}
      <Icon className="size-3.5 text-text-muted" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
