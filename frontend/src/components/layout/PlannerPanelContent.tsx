import * as React from "react";

import { useAnalyze } from "@/api/hooks";
import { StormRouteWordmark } from "@/brand/StormRouteWordmark";
import { PlannerForm } from "@/components/planner/PlannerForm";
import { ResultsPanel } from "@/components/results/ResultsPanel";
import { Button } from "@/components/ui/button";
import { usePlanStore } from "@/store/planStore";
import { useResultsStore } from "@/store/resultsStore";
import { useViewStore } from "@/store/viewStore";

export function PlannerPanelContent() {
  const analyze = useAnalyze();
  const data = useResultsStore((s) => s.data);
  const error = useResultsStore((s) => s.error);
  const setData = useResultsStore((s) => s.setData);
  const setError = useResultsStore((s) => s.setError);
  const formCollapsed = usePlanStore((s) => s.formCollapsed);
  const setFormCollapsed = usePlanStore((s) => s.setFormCollapsed);
  const hydrate = usePlanStore((s) => s.hydrate);
  const origin = usePlanStore((s) => s.origin);
  const destination = usePlanStore((s) => s.destination);
  const setSelectedRouteId = useViewStore((s) => s.setSelectedRouteId);

  React.useEffect(() => {
    hydrate();
  }, [hydrate]);

  React.useEffect(() => {
    if (!data) return;
    const nextId = data.recommendation.route_id ?? data.routes[0]?.id;
    if (nextId) setSelectedRouteId(nextId);
    // Seed map selection once per analyze response.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- request_id is the analyze identity
  }, [data?.request_id, setSelectedRouteId]);

  const retry = () => {
    setError(null);
    setFormCollapsed(false);
  };

  const showResultsChrome = Boolean(data || error || analyze.isPending);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border px-4 pb-3 pt-4 pr-12">
        <StormRouteWordmark compact />
        <p className="mt-1 text-xs text-text-muted">Weather-aware truck routing</p>
      </header>

      <div className="sr-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {formCollapsed && data ? (
          <div
            className="mb-4 flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-surface-raised/60 px-3 py-2.5"
            data-testid="plan-summary-chip"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {origin?.label?.split(",")[0] ?? "Origin"} →{" "}
                {destination?.label?.split(",")[0] ?? "Destination"}
              </p>
              <p className="truncate text-xs text-text-muted">
                {data.routes.length} routes · {data.input.interval_used_mi} mi
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setFormCollapsed(false)}
            >
              Edit
            </Button>
          </div>
        ) : (
          <PlannerForm
            analyze={analyze}
            onSuccess={(next) => {
              setData(next);
              setFormCollapsed(true);
            }}
            onError={(err) => {
              setError(err);
            }}
          />
        )}

        <section
          className={
            showResultsChrome
              ? "mt-5 space-y-3 border-t border-border pt-4"
              : "mt-auto"
          }
        >
          {showResultsChrome ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
              Results
            </p>
          ) : null}
          <ResultsPanel
            data={data ?? undefined}
            error={error}
            loading={analyze.isPending}
            onRetry={retry}
          />
        </section>
      </div>
    </div>
  );
}
