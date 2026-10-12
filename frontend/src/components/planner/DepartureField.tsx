import * as Popover from "@radix-ui/react-popover";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  addMonths,
  monthCells,
  monthLabel,
  monthsInRange,
  sameDay,
  startOfMonth,
  yearsInRange,
} from "@/lib/calendarGrid";
import {
  combineDateAndTime,
  earliestDeparture,
  isDateDisabled,
  latestDeparture,
  nextQuarterHour,
  timeOptionsForDay,
  timezoneAbbreviation,
  toOffsetIso,
} from "@/lib/departure";
import { cn } from "@/lib/utils";

export interface DepartureFieldProps {
  value: string | null;
  onChange: (iso: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function parseLocal(iso: string | null): Date {
  if (!iso) return nextQuarterHour();
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : nextQuarterHour();
}

export function DepartureField({ value, onChange }: DepartureFieldProps) {
  const date = parseLocal(value);
  const [open, setOpen] = React.useState(false);
  const now = new Date();
  const minBound = earliestDeparture(now);
  const maxBound = latestDeparture(now);
  const tz = timezoneAbbreviation(date);
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const times = timeOptionsForDay(date, now);

  const [viewMonth, setViewMonth] = React.useState(() => startOfMonth(date));

  React.useEffect(() => {
    if (!value) {
      onChange(toOffsetIso(nextQuarterHour()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) setViewMonth(startOfMonth(date));
  };

  const allowedMonths = monthsInRange(minBound, maxBound);
  const allowedYears = yearsInRange(minBound, maxBound);
  const minMonth = startOfMonth(minBound);
  const maxMonth = startOfMonth(maxBound);
  const canPrev = viewMonth.getTime() > minMonth.getTime();
  const canNext = viewMonth.getTime() < maxMonth.getTime();
  const cells = monthCells(viewMonth);

  const selectDay = (day: Date) => {
    if (isDateDisabled(day, now)) return;
    // If combine lands outside the window (e.g. early morning yesterday), clamp via time options.
    const options = timeOptionsForDay(day, now);
    if (options.length === 0) return;
    const useTime = options.includes(hhmm) ? hhmm : options[0]!;
    onChange(toOffsetIso(combineDateAndTime(day, useTime)));
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">Departure</span>
        <span className="font-mono text-[11px] text-text-muted">{tz}</span>
      </div>
      <div className="flex gap-2">
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          <Popover.Trigger asChild>
            <Button
              type="button"
              variant="secondary"
              className="h-10 flex-1 justify-start gap-2 font-normal"
              aria-label="Choose departure date"
            >
              <Calendar className="size-4 text-text-muted" />
              {date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </Button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 w-[280px] rounded-[var(--radius-control)] border border-border bg-surface p-3 shadow-panel"
              sideOffset={6}
              align="start"
              data-testid="departure-calendar"
            >
              <div className="mb-3 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={!canPrev}
                  aria-label="Previous month"
                  onClick={() => setViewMonth((m) => addMonths(m, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>

                <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
                  <label className="sr-only" htmlFor="departure-month">
                    Month
                  </label>
                  <select
                    id="departure-month"
                    aria-label="Month"
                    className="h-8 max-w-[9.5rem] truncate rounded-md border border-border bg-surface-raised px-1.5 text-xs text-text"
                    value={`${viewMonth.getFullYear()}-${viewMonth.getMonth()}`}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split("-").map(Number);
                      setViewMonth(new Date(y!, m!, 1));
                    }}
                  >
                    {allowedMonths.map((m) => (
                      <option
                        key={m.toISOString()}
                        value={`${m.getFullYear()}-${m.getMonth()}`}
                      >
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>

                  {allowedYears.length > 1 ? (
                    <>
                      <label className="sr-only" htmlFor="departure-year">
                        Year
                      </label>
                      <select
                        id="departure-year"
                        aria-label="Year"
                        className="h-8 rounded-md border border-border bg-surface-raised px-1.5 text-xs text-text"
                        value={viewMonth.getFullYear()}
                        onChange={(e) => {
                          const y = Number(e.target.value);
                          const next = new Date(y, viewMonth.getMonth(), 1);
                          if (next.getTime() < minMonth.getTime()) {
                            setViewMonth(minMonth);
                          } else if (next.getTime() > maxMonth.getTime()) {
                            setViewMonth(maxMonth);
                          } else {
                            setViewMonth(next);
                          }
                        }}
                      >
                        {allowedYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  disabled={!canNext}
                  aria-label="Next month"
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-text-muted"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, idx) => {
                  if (!day) {
                    return <div key={`pad-${idx}`} className="h-8" />;
                  }
                  const disabled = isDateDisabled(day, now);
                  const selected = sameDay(day, date);
                  const isToday = sameDay(day, now);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      disabled={disabled}
                      aria-label={day.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                      aria-pressed={selected}
                      className={cn(
                        "h-8 rounded-md text-xs tabular-nums transition-colors",
                        selected && "bg-accent font-semibold text-accent-contrast",
                        !selected &&
                          !disabled &&
                          "text-text hover:bg-surface-raised",
                        !selected && isToday && "ring-1 ring-accent/50",
                        disabled && "cursor-not-allowed text-text-muted/35",
                      )}
                      onClick={() => selectDay(day)}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-[10px] leading-snug text-text-muted">
                Departures from 1 hour ago through the next 14 days.
              </p>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <select
          aria-label="Departure time"
          className="h-10 w-[7.5rem] rounded-[var(--radius-control)] border border-border bg-surface px-2 text-sm"
          value={times.includes(hhmm) ? hhmm : (times[0] ?? hhmm)}
          onChange={(e) => {
            onChange(toOffsetIso(combineDateAndTime(date, e.target.value)));
          }}
        >
          {times.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
