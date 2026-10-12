import { AlertTriangle, Info, ShieldCheck } from "lucide-react";

import type { AnalyzeResponse } from "@/api/schemas";

export function RecommendationBanner({ data }: { data: AnalyzeResponse }) {
  const { recommendation, notices } = data;

  return (
    <div className="space-y-2">
      {recommendation.all_blocked ? (
        <div
          className="rounded-[var(--radius-control)] border border-risk-no-travel/40 bg-risk-no-travel/10 p-3"
          role="alert"
          data-testid="all-blocked-banner"
        >
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk-no-travel" />
            <div>
              <p className="text-sm font-semibold text-text">No safe route</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                {recommendation.explanation}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="rounded-[var(--radius-control)] border border-accent/30 bg-accent/10 p-3"
          data-testid="recommendation-banner"
        >
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-semibold text-text">
                Recommended{" "}
                {data.routes.find((r) => r.id === recommendation.route_id)?.label ??
                  recommendation.route_id}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                {recommendation.explanation}
              </p>
            </div>
          </div>
        </div>
      )}
      {notices.map((notice) => (
        <div
          key={notice}
          className="flex gap-2 rounded-[var(--radius-control)] border border-border bg-surface-raised/50 p-2.5"
          role="status"
        >
          <Info className="mt-0.5 size-3.5 shrink-0 text-text-muted" />
          <p className="text-xs text-text-muted">{notice}</p>
        </div>
      ))}
    </div>
  );
}
