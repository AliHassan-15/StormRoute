import { Minus, Plus } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface NumberFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  value: number;
  onValueChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}

export function NumberField({
  value,
  onValueChange,
  step = 1,
  min,
  max,
  className,
  disabled,
  id,
  ...props
}: NumberFieldProps) {
  const clamp = (next: number) => {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-10 shrink-0"
        disabled={disabled || (min !== undefined && value <= min)}
        onClick={() => onValueChange(clamp(value - step))}
        aria-label="Decrease"
      >
        <Minus className="size-4" />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        data-numeric="true"
        className="text-center font-mono tabular-nums"
        value={Number.isFinite(value) ? value : ""}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onValueChange(clamp(next));
        }}
        {...props}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-10 shrink-0"
        disabled={disabled || (max !== undefined && value >= max)}
        onClick={() => onValueChange(clamp(value + step))}
        aria-label="Increase"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
