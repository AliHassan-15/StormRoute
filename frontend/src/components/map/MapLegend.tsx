import { ChevronDown } from "lucide-react";
import * as React from "react";

import { useMeta } from "@/api/hooks";
import { RISK_HEX } from "@/map/riskPaint";
import { cn } from "@/lib/utils";

export function MapLegend() {
  const meta = useMeta();
  const [open, setOpen] = React.useState(true);
  const levels = meta.data?.levels ?? [];

  return (
    <div
      className="pointer-events-auto absolute bottom-28 left-14 z-20 w-44 md:left-16"
      data-testid="map-legend"
    >
      <div className="overflow-hidden rounded-[var(--radius-control)] border border-border bg-[var(--sr-glass-bg)] shadow-soft backdrop-blur-xl">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-text"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Risk legend
          <ChevronDown
            className={cn(
              "size-3.5 text-text-muted transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {open ? (
          <ul className="space-y-1.5 border-t border-border px-3 py-2">
            {levels.map((level) => (
              <li
                key={level.name}
                className="flex items-center gap-2 text-[11px] text-text"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    background:
                      RISK_HEX[level.name as keyof typeof RISK_HEX] ??
                      RISK_HEX.UNKNOWN,
                  }}
                  aria-hidden
                />
                <span>{level.label}</span>
              </li>
            ))}
            <li className="flex items-center gap-2 text-[11px] text-text">
              <span
                className="h-0.5 w-4 shrink-0 border-t-2 border-dotted border-[#64748b]"
                aria-hidden
              />
              <span>Unknown (no forecast)</span>
            </li>
            <li className="flex items-center gap-2 text-[11px] text-text">
              <span
                className="h-0.5 w-4 shrink-0"
                style={{
                  background:
                    "repeating-linear-gradient(90deg,#c026d3 0 4px,transparent 4px 8px)",
                }}
                aria-hidden
              />
              <span>No Travel (dashed)</span>
            </li>
          </ul>
        ) : null}
      </div>
    </div>
  );
}
