import { ChevronLeft, ChevronRight, X } from "lucide-react";
import * as React from "react";
import { Drawer } from "vaul";

import { useMeta } from "@/api/hooks";
import type { Checkpoint } from "@/api/schemas";
import { RiskBadge } from "@/components/ui/risk-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatLocalTime, formatMiles } from "@/lib/format";
import type { RiskLevel } from "@/lib/risk";
import {
  thresholdGaugePosition,
  type ConditionKey,
} from "@/lib/thresholdGauge";
import { useResultsStore } from "@/store/resultsStore";
import { useViewStore } from "@/store/viewStore";

function MiniGauge({
  value,
  position,
  unit,
}: {
  value: string;
  position: number;
  unit: string;
}) {
  return (
    <div className="mt-1">
      <div className="flex justify-between font-mono text-[11px] tabular-nums text-text-muted">
        <span>
          {value} {unit}
        </span>
        <span>{Math.round(position * 100)}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.round(position * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ConditionRow({
  label,
  value,
  unit,
  level,
  gaugeKey,
  meta,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  level: RiskLevel;
  gaugeKey: ConditionKey;
  meta: ReturnType<typeof useMeta>["data"];
}) {
  const display =
    value == null || !Number.isFinite(value)
      ? "—"
      : gaugeKey === "wind_mph"
        ? value.toFixed(0)
        : value.toFixed(2);
  const pos = thresholdGaugePosition(meta, gaugeKey, value);
  return (
    <div className="rounded-[var(--radius-control)] border border-border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text">{label}</span>
        <RiskBadge level={level} />
      </div>
      <MiniGauge value={display} position={pos} unit={unit} />
    </div>
  );
}

function DrawerBody({
  checkpoint,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  checkpoint: Checkpoint;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const meta = useMeta();
  const unknown =
    checkpoint.weather_status !== "ok" ||
    checkpoint.level_name === "UNKNOWN" ||
    checkpoint.level == null;
  const level = (
    unknown ? "UNKNOWN" : checkpoint.level_name
  ) as RiskLevel;
  const cond = checkpoint.condition_levels;

  return (
    <div className="space-y-3" data-testid="checkpoint-drawer-body">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-text-muted">Mile marker</p>
          <p className="font-mono text-lg font-semibold tabular-nums text-text">
            {formatMiles(checkpoint.mile, 1)}
          </p>
        </div>
        <RiskBadge level={level} />
      </div>

      <div>
        <p className="text-xs text-text-muted">Local ETA</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="font-mono text-sm tabular-nums text-text underline decoration-dotted"
              >
                {formatLocalTime(checkpoint.eta_local)}
              </button>
            </TooltipTrigger>
            <TooltipContent>UTC {checkpoint.eta_utc}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {unknown ? (
        <p className="text-sm text-text-muted">No forecast for this checkpoint.</p>
      ) : (
        <div className="space-y-2">
          <ConditionRow
            label="Wind"
            value={checkpoint.weather?.wind_mph}
            unit="mph"
            level={(cond?.wind ?? "UNKNOWN") as RiskLevel}
            gaugeKey="wind_mph"
            meta={meta.data}
          />
          <ConditionRow
            label="Rain"
            value={checkpoint.weather?.rain_in_hr}
            unit="in/hr"
            level={(cond?.rain ?? "UNKNOWN") as RiskLevel}
            gaugeKey="rain_in_hr"
            meta={meta.data}
          />
          <ConditionRow
            label="Snow"
            value={checkpoint.weather?.snow_in_hr}
            unit="in/hr"
            level={(cond?.snow ?? "UNKNOWN") as RiskLevel}
            gaugeKey="snow_in_hr"
            meta={meta.data}
          />
          {checkpoint.weather?.gust_mph != null ? (
            <p className="text-xs text-text-muted">
              Gusts {checkpoint.weather.gust_mph.toFixed(0)} mph (informational
              only — not used in risk).
            </p>
          ) : null}
        </div>
      )}

      {checkpoint.reasons.length ? (
        <ul className="list-disc space-y-1 pl-4 text-xs text-text-muted">
          {checkpoint.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-control)] border border-border px-3 py-2 text-xs disabled:opacity-40"
          disabled={!hasPrev}
          onClick={onPrev}
          aria-label="Previous checkpoint"
        >
          <ChevronLeft className="size-3.5" /> Previous
        </button>
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-[var(--radius-control)] border border-border px-3 py-2 text-xs disabled:opacity-40"
          disabled={!hasNext}
          onClick={onNext}
          aria-label="Next checkpoint"
        >
          Next <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Checkpoint detail — right panel on desktop, bottom sheet on mobile. */
export function CheckpointDrawer() {
  const open = useViewStore((s) => s.checkpointDrawerOpen);
  const index = useViewStore((s) => s.selectedCheckpointIndex);
  const routeId = useViewStore((s) => s.selectedRouteId);
  const openCheckpoint = useViewStore((s) => s.openCheckpoint);
  const close = useViewStore((s) => s.closeCheckpointDrawer);
  const data = useResultsStore((s) => s.data);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const route = React.useMemo(
    () =>
      data?.routes.find((r) => r.id === routeId) ??
      data?.routes.find((r) => r.is_recommended) ??
      data?.routes[0],
    [data, routeId],
  );
  const checkpoints = React.useMemo(
    () => route?.checkpoints ?? [],
    [route],
  );
  const checkpoint =
    index != null ? checkpoints.find((c) => c.index === index) : undefined;
  const idxPos = checkpoints.findIndex((c) => c.index === index);

  const go = React.useCallback(
    (delta: number) => {
      const next = checkpoints[idxPos + delta];
      if (next) openCheckpoint(next.index);
    },
    [checkpoints, idxPos, openCheckpoint],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, close]);

  if (!checkpoint || !open) {
    return null;
  }

  const body = (
    <DrawerBody
      checkpoint={checkpoint}
      onPrev={() => go(-1)}
      onNext={() => go(1)}
      hasPrev={idxPos > 0}
      hasNext={idxPos >= 0 && idxPos < checkpoints.length - 1}
    />
  );

  if (isDesktop) {
    return (
      <aside
        className="pointer-events-auto absolute bottom-[15.5rem] right-3 top-20 z-30 flex w-[min(19rem,calc(100%-5.5rem))] flex-col md:right-4"
        data-testid="checkpoint-drawer"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-border bg-[var(--sr-glass-bg)] shadow-panel backdrop-blur-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
            <h2 className="text-sm font-semibold text-text">Checkpoint</h2>
            <button
              type="button"
              aria-label="Close checkpoint"
              className="rounded p-1.5 text-text-muted hover:bg-surface-raised"
              onClick={close}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="sr-scroll min-h-0 flex-1 overflow-auto p-3">{body}</div>
        </div>
      </aside>
    );
  }

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[40] bg-black/40" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-[50] flex max-h-[85vh] flex-col rounded-t-[var(--radius-panel)] border border-border bg-surface outline-none"
          data-testid="checkpoint-drawer"
        >
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border" />
          <Drawer.Title className="px-4 pt-3 text-sm font-semibold">
            Checkpoint
          </Drawer.Title>
          <div className="overflow-auto px-4 pb-6 pt-2">{body}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
