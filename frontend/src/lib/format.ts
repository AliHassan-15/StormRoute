/**
 * Display formatters. Local times use the ISO offset from the API — never the browser TZ.
 */

/** Format distance in miles for UI (e.g. 125.4 mi). */
export function formatMiles(miles: number, digits = 1): string {
  if (!Number.isFinite(miles)) return "—";
  const rounded = Math.abs(miles - Math.round(miles)) < 1e-9
    ? String(Math.round(miles))
    : miles.toFixed(digits);
  return `${rounded} mi`;
}

/** Format duration seconds as compact h/m (3660 → "1h 1m"). */
export function formatDuration(duration_s: number): string {
  if (!Number.isFinite(duration_s) || duration_s < 0) return "—";
  const totalMin = Math.round(duration_s / 60);
  if (totalMin === 0) return "0m";
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Format delay vs fastest: 0 → "Fastest", else "+25 min" / "+1h 5m". */
export function formatDelta(delay_s: number): string {
  if (!Number.isFinite(delay_s) || Math.abs(delay_s) < 30) return "Fastest";
  const totalMin = Math.round(Math.abs(delay_s) / 60);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const sign = delay_s > 0 ? "+" : "−";
  if (hours === 0) return `${sign}${minutes} min`;
  if (minutes === 0) return `${sign}${hours}h`;
  return `${sign}${hours}h ${minutes}m`;
}

export interface FormatLocalTimeOptions {
  /** Departure local ISO used to decide whether to show the date. */
  departureLocal?: string | null;
}

/**
 * Format an API local ISO-8601 string using its embedded offset.
 * Never converts to the browser timezone.
 */
export function formatLocalTime(
  isoLocal: string | null | undefined,
  options: FormatLocalTimeOptions = {},
): string {
  if (!isoLocal) return "—";
  const match = isoLocal.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?([+-]\d{2}:\d{2}|Z)$/,
  );
  if (!match) return isoLocal;

  const [, y, mo, d, hh, mm] = match;
  const time = `${hh}:${mm}`;
  const dateKey = `${y}-${mo}-${d}`;

  let showDate = false;
  if (options.departureLocal) {
    const dep = options.departureLocal.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dep && dep[1] !== dateKey) showDate = true;
  }

  if (showDate) {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = months[Number(mo) - 1] ?? mo;
    return `${month} ${Number(d)}, ${time}`;
  }
  return time;
}

/** Format average risk as "x.x / 5". */
export function formatAvgRisk(avg: number | null | undefined): string {
  if (avg == null || !Number.isFinite(avg)) return "— / 5";
  return `${avg.toFixed(1)} / 5`;
}
