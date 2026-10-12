/** Month-grid helpers for the departure calendar. Units: local calendar days. */

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Sunday-start week cells for a month (null = padding outside the month). */
export function monthCells(month: Date): Array<Date | null> {
  const first = startOfMonth(month);
  const startPad = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function monthLabel(month: Date): string {
  return month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Distinct calendar months that intersect [from, to]. */
export function monthsInRange(from: Date, to: Date): Date[] {
  const months: Date[] = [];
  let cursor = startOfMonth(from);
  const end = startOfMonth(to);
  while (cursor.getTime() <= end.getTime()) {
    months.push(new Date(cursor));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/** Distinct years that intersect [from, to]. */
export function yearsInRange(from: Date, to: Date): number[] {
  const years: number[] = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y += 1) {
    years.push(y);
  }
  return years;
}
