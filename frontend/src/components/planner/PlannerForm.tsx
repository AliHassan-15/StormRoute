import { ArrowUpDown, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import * as React from "react";

import { ApiError } from "@/api/errors";
import { fetchGeocode, useMeta, type AnalyzeMutation } from "@/api/hooks";
import type { AnalyzeResponse } from "@/api/schemas";
import { DepartureField } from "@/components/planner/DepartureField";
import { LoadField } from "@/components/planner/LoadField";
import { PlaceCombobox } from "@/components/planner/PlaceCombobox";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { isPlanFormValid } from "@/lib/planSchema";
import { motionSafe } from "@/lib/motion";
import { usePlanStore, type IntervalChoice } from "@/store/planStore";
import { useViewStore } from "@/store/viewStore";

const INTERVAL_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
] as const;

const EXAMPLES = [
  { origin: "Dallas, TX", destination: "Chicago, IL" },
  { origin: "Denver, CO", destination: "Salt Lake City, UT" },
  { origin: "Atlanta, GA", destination: "New York, NY" },
] as const;

export interface PlannerFormProps {
  onSuccess: (data: AnalyzeResponse) => void;
  onError: (error: unknown) => void;
  analyze: AnalyzeMutation;
}

export function PlannerForm({ onSuccess, onError, analyze }: PlannerFormProps) {
  const meta = useMeta();
  const origin = usePlanStore((s) => s.origin);
  const destination = usePlanStore((s) => s.destination);
  const departure = usePlanStore((s) => s.departure);
  const loadLb = usePlanStore((s) => s.loadLb);
  const interval = usePlanStore((s) => s.interval);
  const setOrigin = usePlanStore((s) => s.setOrigin);
  const setDestination = usePlanStore((s) => s.setDestination);
  const setDeparture = usePlanStore((s) => s.setDeparture);
  const setLoadLb = usePlanStore((s) => s.setLoadLb);
  const setInterval = usePlanStore((s) => s.setInterval);
  const swapPlaces = usePlanStore((s) => s.swapPlaces);
  const setFormCollapsed = usePlanStore((s) => s.setFormCollapsed);
  const resetSelection = useViewStore((s) => s.resetSelection);
  const [swapSpin, setSwapSpin] = React.useState(0);
  const [exampleLoading, setExampleLoading] = React.useState(false);

  const valid = isPlanFormValid({
    origin,
    destination,
    departure,
    loadLb,
    interval,
  });

  const submit = () => {
    if (!valid || !origin || !destination || !departure) return;
    resetSelection();
    analyze.mutate(
      {
        origin,
        destination,
        departure_time: departure,
        load_lb: loadLb,
        interval,
      },
      {
        onSuccess: (data) => {
          setFormCollapsed(true);
          onSuccess(data);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "ABORT") return;
          onError(err);
        },
      },
    );
  };

  const fillExample = async (originQ: string, destQ: string) => {
    setExampleLoading(true);
    try {
      const [oResults, dResults] = await Promise.all([
        fetchGeocode(originQ),
        fetchGeocode(destQ),
      ]);
      const o = oResults[0];
      const d = dResults[0];
      if (o) setOrigin({ label: o.label, lat: o.lat, lng: o.lng });
      if (d) setDestination({ label: d.label, lat: d.lat, lng: d.lng });
    } finally {
      setExampleLoading(false);
    }
  };

  const intervalValue =
    interval === "auto" ? "auto" : String(interval);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col">
        <PlaceCombobox
          id="origin"
          label="Origin"
          value={origin}
          onChange={setOrigin}
        />
        <div className="mt-2 mb-0.5 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-8 rounded-full border border-border bg-surface shadow-soft"
            aria-label="Swap origin and destination"
            onClick={() => {
              setSwapSpin((n) => n + 1);
              swapPlaces();
            }}
          >
            <motion.span
              animate={{ rotate: swapSpin * 180 }}
              transition={motionSafe({ duration: 0.2 })}
              className="inline-flex"
            >
              <ArrowUpDown className="size-3.5" />
            </motion.span>
          </Button>
        </div>
        <PlaceCombobox
          id="destination"
          label="Destination"
          value={destination}
          onChange={setDestination}
        />
      </div>

      <DepartureField value={departure} onChange={setDeparture} />

      <LoadField value={loadLb} onChange={setLoadLb} meta={meta.data} />

      <div className="space-y-2">
        <span className="text-xs font-medium text-text-muted">
          Checkpoint (mi)
        </span>
        <SegmentedControl
          ariaLabel="Checkpoint interval"
          value={intervalValue}
          onValueChange={(v) => {
            const next: IntervalChoice =
              v === "auto" ? "auto" : (Number(v) as 10 | 25 | 50);
            setInterval(next);
          }}
          options={[...INTERVAL_OPTIONS]}
          className="w-full justify-between [&_button]:flex-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
        <span className="shrink-0">Try</span>
        {EXAMPLES.map((ex) => (
          <button
            key={`${ex.origin}-${ex.destination}`}
            type="button"
            disabled={exampleLoading || analyze.isPending}
            className="text-accent underline-offset-2 hover:underline disabled:opacity-50"
            onClick={() => void fillExample(ex.origin, ex.destination)}
          >
            {ex.origin.split(",")[0]}→{ex.destination.split(",")[0]}
          </button>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          className="flex-1"
          disabled={!valid || analyze.isPending}
        >
          {analyze.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            "Analyze routes"
          )}
        </Button>
        {analyze.isPending ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => analyze.cancel()}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
