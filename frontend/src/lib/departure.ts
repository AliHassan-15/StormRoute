/** Departure date/time helpers. Output always includes a timezone offset. */

/** Round up to the next 15-minute boundary in local browser time. */
export function nextQuarterHour(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  const minutes = d.getMinutes();
  const rem = minutes % 15;
  if (rem === 0 && from.getSeconds() === 0 && from.getMilliseconds() === 0) {
    return d;
  }
  d.setMinutes(minutes + (15 - rem));
  return d;
}

/** Format a Date as ISO-8601 with numeric offset (not Z). */
export function toOffsetIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${oh}:${om}`
  );
}

export function timezoneAbbreviation(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "local";
  } catch {
    return "local";
  }
}

export function earliestDeparture(now: Date = new Date()): Date {
  return new Date(now.getTime() - 60 * 60 * 1000);
}

export function latestDeparture(now: Date = new Date()): Date {
  return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
}

export function isDateDisabled(day: Date, now: Date = new Date()): boolean {
  const start = earliestDeparture(now);
  const end = latestDeparture(now);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  return dayEnd < start || dayStart > end;
}

/** 15-minute time options for a given calendar day. */
export function timeOptionsForDay(day: Date, now: Date = new Date()): string[] {
  const options: string[] = [];
  const start = earliestDeparture(now);
  const end = latestDeparture(now);
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += 15) {
      const candidate = new Date(day);
      candidate.setHours(h, m, 0, 0);
      if (candidate >= start && candidate <= end) {
        options.push(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        );
      }
    }
  }
  return options;
}

export function combineDateAndTime(day: Date, hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date(day);
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d;
}
