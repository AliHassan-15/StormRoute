import type { Place } from "@/api/schemas";

export type IntervalChoice = "auto" | 10 | 25 | 50;

export interface PersistedPlan {
  origin: Place | null;
  destination: Place | null;
  departure: string | null;
  loadLb: number;
  interval: IntervalChoice;
}

const KEY = "stormroute.plan.v1";

function isInterval(value: unknown): value is IntervalChoice {
  return value === "auto" || value === 10 || value === 25 || value === 50;
}

/** Persist plan inputs; skip departures that are already in the past. */
export function persistPlanToStorage(plan: PersistedPlan): void {
  try {
    let departure = plan.departure;
    if (departure) {
      const t = Date.parse(departure);
      if (Number.isFinite(t) && t < Date.now() - 60_000) {
        departure = null;
      }
    }
    const payload: PersistedPlan = { ...plan, departure };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function loadPlanFromStorage(): PersistedPlan | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedPlan>;
    let departure = data.departure ?? null;
    if (departure) {
      const t = Date.parse(departure);
      if (!Number.isFinite(t) || t < Date.now() - 60_000) {
        departure = null;
      }
    }
    return {
      origin: data.origin ?? null,
      destination: data.destination ?? null,
      departure,
      loadLb: typeof data.loadLb === "number" ? data.loadLb : 0,
      interval: isInterval(data.interval) ? data.interval : "auto",
    };
  } catch {
    return null;
  }
}
