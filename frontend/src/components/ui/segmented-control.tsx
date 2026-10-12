import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ariaLabel = "Segmented control",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-[var(--radius-control)] border border-border bg-surface-raised p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn(
              "rounded-[8px] px-3 py-1.5 text-sm transition-colors duration-[var(--duration-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              selected
                ? "bg-surface text-text shadow-soft"
                : "text-text-muted hover:text-text",
            )}
            onClick={() => onValueChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
