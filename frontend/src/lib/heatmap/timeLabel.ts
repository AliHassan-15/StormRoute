/**
 * Format heatmap slider time in the user's local timezone.
 */

const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Absolute UTC ms for frame hour h: t0 + h hours. */
export function frameUtcMs(t0Utc: string, hour: number): number {
  const base = Date.parse(t0Utc);
  if (!Number.isFinite(base)) return NaN;
  return base + hour * 3_600_000;
}

/** e.g. "Mon, Oct 12 · 1:00 PM" */
export function formatHeatmapTimeLabel(t0Utc: string, hour: number): string {
  const ms = frameUtcMs(t0Utc, hour);
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  return `${WEEKDAY.format(d)}, ${DATE.format(d)} · ${TIME.format(d)}`;
}

export function formatHeatmapAriaValueText(t0Utc: string, hour: number): string {
  const label = formatHeatmapTimeLabel(t0Utc, hour);
  return `Hour ${hour} of 48, ${label}`;
}
