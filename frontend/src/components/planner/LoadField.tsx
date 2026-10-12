import * as React from "react";

import type { MetaResponse } from "@/api/schemas";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { loadRulesHelperText } from "@/lib/loadRulesHelper";
import { cn } from "@/lib/utils";

const PRESETS = [
  { label: "Empty", value: 0 },
  { label: "34k", value: 34_000 },
  { label: "45k", value: 45_000 },
  { label: "80k", value: 80_000 },
] as const;

export interface LoadFieldProps {
  value: number;
  onChange: (lb: number) => void;
  meta?: MetaResponse;
}

function formatThousands(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function LoadField({ value, onChange, meta }: LoadFieldProps) {
  const sliderValue = Math.min(value, 80_000);
  const softWarn = value > 80_000;
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(formatThousands(value));
  const display = editing ? text : formatThousands(value);
  const helper = loadRulesHelperText(value, meta);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium text-text-muted" htmlFor="load-lb">
          Load (lb)
        </label>
        <Input
          id="load-lb"
          inputMode="numeric"
          data-numeric="true"
          className="h-9 w-28 text-right font-mono text-sm tabular-nums"
          value={display}
          aria-describedby="load-helper"
          title={helper}
          onFocus={() => {
            setEditing(true);
            setText(formatThousands(value));
          }}
          onBlur={() => setEditing(false)}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            setText(digits.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
            const next = digits === "" ? 0 : Number(digits);
            if (Number.isFinite(next)) {
              onChange(Math.min(200_000, Math.max(0, next)));
            }
          }}
        />
      </div>
      <Slider
        min={0}
        max={80_000}
        step={500}
        value={[sliderValue]}
        onValueChange={(vals) => onChange(vals[0] ?? 0)}
        aria-label="Load weight slider up to 80,000 lb"
      />
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={cn(
              "rounded-md border border-border px-2 py-0.5 text-[11px] transition-colors",
              value === preset.value
                ? "border-accent bg-accent/15 text-text"
                : "text-text-muted hover:bg-surface-raised",
            )}
            onClick={() => onChange(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {/* Screen-reader + a11y id kept; visual wall of text removed. */}
      <p id="load-helper" className="sr-only">
        {helper}
      </p>
      {softWarn ? (
        <p className="text-[11px] text-risk-severe" role="status">
          Unusual load — confirm the weight.
        </p>
      ) : null}
    </div>
  );
}
