import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  tickCount?: number;
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    {
      className,
      tickCount = 0,
      showValue = false,
      formatValue = (value) => String(value),
      value,
      defaultValue,
      min = 0,
      max = 100,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      ...props
    },
    ref,
  ) => {
    const current = value?.[0] ?? defaultValue?.[0] ?? min;
    const ticks = React.useMemo(() => {
      if (tickCount <= 1) return [] as number[];
      return Array.from({ length: tickCount }, (_, index) => index / (tickCount - 1));
    }, [tickCount]);

    return (
      <div className={cn("w-full", className)}>
        {showValue ? (
          <div className="mb-2 flex justify-end font-mono text-sm tabular-nums text-text-muted">
            {formatValue(current)}
          </div>
        ) : null}
        <SliderPrimitive.Root
          ref={ref}
          className="relative flex h-9 w-full touch-none select-none items-center"
          value={value}
          defaultValue={defaultValue}
          min={min}
          max={max}
          {...props}
        >
          <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-border">
            <SliderPrimitive.Range className="absolute h-full bg-accent" />
          </SliderPrimitive.Track>
          {ticks.map((ratio) => (
            <span
              key={ratio}
              className="pointer-events-none absolute top-1/2 size-1 -translate-y-1/2 rounded-full bg-text-muted/50"
              style={{ left: `calc(${ratio * 100}% - 2px)` }}
              aria-hidden="true"
            />
          ))}
          <SliderPrimitive.Thumb
            className="block size-5 rounded-full border border-border bg-surface shadow-soft transition-colors duration-[var(--duration-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
          />
        </SliderPrimitive.Root>
      </div>
    );
  },
);
Slider.displayName = SliderPrimitive.Root.displayName;
