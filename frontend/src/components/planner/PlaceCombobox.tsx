import { Loader2, X } from "lucide-react";
import * as React from "react";

import { fetchGeocode } from "@/api/hooks";
import type { GeocodeResult, Place } from "@/api/schemas";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PlaceComboboxProps {
  id: string;
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  placeholder?: string;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-accent/30 text-inherit">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

/** ARIA 1.2 combobox for geocoded places. */
export function PlaceCombobox({
  id,
  label,
  value,
  onChange,
  placeholder = "City or address",
}: PlaceComboboxProps) {
  const listboxId = `${id}-listbox`;
  const [query, setQuery] = React.useState(value?.label ?? "");
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [options, setOptions] = React.useState<GeocodeResult[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [prevValueLabel, setPrevValueLabel] = React.useState(value?.label ?? "");
  const requestId = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync query when parent sets a place (examples, swap, restore).
  const valueLabel = value?.label ?? "";
  if (valueLabel !== prevValueLabel) {
    setPrevValueLabel(valueLabel);
    if (valueLabel) setQuery(valueLabel);
  }

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      abortRef.current?.abort();
      return;
    }
    if (value && trimmed === value.label) {
      return;
    }

    const handle = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const idNow = ++requestId.current;
      setLoading(true);
      void fetchGeocode(trimmed, controller.signal)
        .then((results) => {
          if (idNow !== requestId.current) return;
          setOptions(results);
          setActiveIndex(results.length ? 0 : -1);
          setOpen(true);
        })
        .catch((error: unknown) => {
          if (idNow !== requestId.current) return;
          if (error instanceof Error && error.name === "AbortError") return;
          setOptions([]);
        })
        .finally(() => {
          if (idNow === requestId.current) setLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [query, value]);

  const select = (item: GeocodeResult) => {
    onChange({ label: item.label, lat: item.lat, lng: item.lng });
    setQuery(item.label);
    setPrevValueLabel(item.label);
    setOpen(false);
    setOptions([]);
    setActiveIndex(-1);
  };

  const onInputChange = (next: string) => {
    setQuery(next);
    if (value) onChange(null);
    if (next.trim().length < 3) {
      abortRef.current?.abort();
      setOptions([]);
      setLoading(false);
      setActiveIndex(-1);
    }
    setOpen(true);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const key = event.key;
    if (key === "ArrowDown" || key === "Down") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => {
        const max = Math.max(options.length - 1, 0);
        return Math.min((i < 0 ? -1 : i) + 1, max);
      });
      return;
    }
    if (key === "ArrowUp" || key === "Up") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (key === "Enter") {
      const item = open && activeIndex >= 0 ? options[activeIndex] : undefined;
      if (item) {
        event.preventDefault();
        select(item);
      }
      return;
    }
    if (key === "Escape" || key === "Esc") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="relative space-y-2">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined
          }
          value={query}
          placeholder={placeholder}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (options.length) setOpen(true);
          }}
          autoComplete="off"
          className="pr-9"
        />
        {query ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text"
            aria-label={`Clear ${label}`}
            onClick={() => {
              setQuery("");
              setPrevValueLabel("");
              onChange(null);
              setOptions([]);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
        ) : null}
        {loading ? (
          <Loader2
            className="pointer-events-none absolute right-8 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-muted"
            aria-hidden
          />
        ) : null}
      </div>
      {open && query.trim().length >= 3 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-48 w-full overflow-auto rounded-[var(--radius-control)] border border-border bg-surface p-1 shadow-panel"
        >
          {loading && options.length === 0 ? (
            <li className="px-2 py-2 text-sm text-text-muted">Searching…</li>
          ) : null}
          {!loading && options.length === 0 ? (
            <li className="px-2 py-2 text-sm text-text-muted">No results</li>
          ) : null}
          {options.map((item, index) => (
            <li key={item.id} role="presentation">
              <button
                type="button"
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "w-full rounded-md px-2 py-2 text-left text-sm",
                  index === activeIndex
                    ? "bg-surface-raised text-text"
                    : "text-text hover:bg-surface-raised/70",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(item)}
              >
                {highlightMatch(item.label, query)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
