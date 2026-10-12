import { HelpCircle } from "lucide-react";

import { useMeta } from "@/api/hooks";
import type { MetaResponse } from "@/api/schemas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiStore } from "@/store/uiStore";

function formatBound(
  lower: number | null,
  upper: number | null,
  loIncl: boolean,
  hiIncl: boolean,
  unit: string,
): string {
  const lo =
    lower == null
      ? "—"
      : `${loIncl ? "≥" : ">"}${lower}${unit ? ` ${unit}` : ""}`;
  const hi =
    upper == null
      ? "∞"
      : `${hiIncl ? "≤" : "<"}${upper}${unit ? ` ${unit}` : ""}`;
  if (lower == null && upper != null) return hi;
  if (upper == null && lower != null) return lo;
  return `${lo} and ${hi}`;
}

function ThresholdTable({
  title,
  unit,
  bands,
}: {
  title: string;
  unit: string;
  bands: MetaResponse["thresholds"]["wind_mph"]["bands"];
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-raised text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Level</th>
              <th className="px-3 py-2 font-medium">Range ({unit})</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr key={band.level} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-text">
                  {band.level.replaceAll("_", " ")}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-text-muted">
                  {formatBound(
                    band.lower,
                    band.upper,
                    band.lower_inclusive,
                    band.upper_inclusive,
                    "",
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MetaBody({ meta }: { meta: MetaResponse }) {
  return (
    <div className="max-h-[min(70vh,32rem)] space-y-5 overflow-y-auto pr-1">
      <ThresholdTable
        title="Wind"
        unit={meta.units.wind ?? "mph"}
        bands={meta.thresholds.wind_mph.bands}
      />
      <ThresholdTable
        title="Rain"
        unit={meta.units.rain ?? "in/hr"}
        bands={meta.thresholds.rain_in_hr.bands}
      />
      <ThresholdTable
        title="Snow"
        unit={meta.units.snow ?? "in/hr"}
        bands={meta.thresholds.snow_in_hr.bands}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text">Load rules</h3>
        <p className="text-xs text-text-muted">
          Applied after base classification and can only raise the level.
        </p>
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-text">
          {meta.load_rules.map((rule) => (
            <li key={rule.id}>{rule.description}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text">Boundary conventions</h3>
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-text-muted">
          <li>
            Lower bounds are inclusive where the table is ambiguous; rain exactly
            1.00 in/hr and snow exactly 3.0 in/hr are Severe (No Travel is
            strictly greater).
          </li>
          <li>
            Load thresholds use strict inequalities (load &gt; 30,000 lb and
            load &gt; 40,000 lb).
          </li>
          <li>
            Final checkpoint level is the worst of wind, rain, and snow after
            load rules.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text">Assumptions</h3>
        <ul className="list-disc space-y-1.5 pl-4 text-xs text-text-muted">
          <li>Wind is sustained 10 m wind speed (mph); gusts are display-only.</li>
          <li>Weather uses the hourly slot nearest each checkpoint ETA.</li>
          <li>ETAs assume continuous driving (no breaks, no traffic).</li>
          <li>Routing uses Mapbox driving (car profile); truck restrictions are not modelled.</li>
          <li>Weather coordinates are snapped to 0.05° before fetch.</li>
        </ul>
      </section>
    </div>
  );
}

/** Help dialog driven by GET /api/meta (D16). */
export function HowRiskDialog() {
  const open = useUiStore((s) => s.howRiskOpen);
  const setOpen = useUiStore((s) => s.setHowRiskOpen);
  const meta = useMeta();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11"
          aria-label="How risk is calculated"
          data-testid="how-risk-trigger"
        >
          <HelpCircle className="size-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="w-[min(92vw,36rem)]"
        data-testid="how-risk-dialog"
      >
        <DialogHeader>
          <DialogTitle>How risk is calculated</DialogTitle>
          <DialogDescription>
            Thresholds and load rules from the live risk model. Colour is never
            the only cue — levels also use labels and patterns.
          </DialogDescription>
        </DialogHeader>
        {meta.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : meta.isError || !meta.data ? (
          <p className="text-sm text-destructive" role="alert">
            Could not load risk thresholds. Check your connection and try again.
          </p>
        ) : (
          <MetaBody meta={meta.data} />
        )}
      </DialogContent>
    </Dialog>
  );
}
