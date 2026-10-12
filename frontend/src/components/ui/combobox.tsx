import * as Popover from "@radix-ui/react-popover";
import { ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
  id?: string;
}

/** Combobox shell — filterable list in a popover (no async geocoding yet). */
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Search…",
  emptyText = "No matches",
  className,
  id,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-[var(--radius-control)] border border-border bg-surface px-3 text-left text-sm shadow-soft transition-colors duration-[var(--duration-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            className,
          )}
          aria-expanded={open}
        >
          <span className={selected ? "text-text" : "text-text-muted"}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 text-text-muted" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-[var(--radius-control)] border border-border bg-surface p-2 shadow-panel"
          sideOffset={6}
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="mb-2"
            autoFocus
          />
          <ul className="max-h-48 overflow-auto" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-sm text-text-muted">{emptyText}</li>
            ) : (
              filtered.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    className={cn(
                      "flex w-full rounded-[8px] px-2 py-2 text-left text-sm hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                      option.value === value && "bg-surface-raised text-accent",
                    )}
                    onClick={() => {
                      onValueChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
