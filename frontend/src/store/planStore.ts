import { create } from "zustand";

import type { Place } from "@/api/schemas";
import {
  loadPlanFromStorage,
  persistPlanToStorage,
  type IntervalChoice,
  type PersistedPlan,
} from "@/lib/persistence";

export type { IntervalChoice };

export interface PlanState {
  origin: Place | null;
  destination: Place | null;
  /** ISO-8601 with offset */
  departure: string | null;
  loadLb: number;
  interval: IntervalChoice;
  /** True after a successful analyze until Edit is pressed. */
  formCollapsed: boolean;
  setOrigin: (place: Place | null) => void;
  setDestination: (place: Place | null) => void;
  setDeparture: (iso: string | null) => void;
  setLoadLb: (lb: number) => void;
  setInterval: (interval: IntervalChoice) => void;
  swapPlaces: () => void;
  setFormCollapsed: (collapsed: boolean) => void;
  hydrate: () => void;
  snapshot: () => PersistedPlan;
}

function persist(get: () => PlanState): void {
  const s = get();
  persistPlanToStorage({
    origin: s.origin,
    destination: s.destination,
    departure: s.departure,
    loadLb: s.loadLb,
    interval: s.interval,
  });
}

export const usePlanStore = create<PlanState>((set, get) => ({
  origin: null,
  destination: null,
  departure: null,
  loadLb: 0,
  interval: "auto",
  formCollapsed: false,
  setOrigin: (place) => {
    set({ origin: place });
    persist(get);
  },
  setDestination: (place) => {
    set({ destination: place });
    persist(get);
  },
  setDeparture: (iso) => {
    set({ departure: iso });
    persist(get);
  },
  setLoadLb: (lb) => {
    set({ loadLb: lb });
    persist(get);
  },
  setInterval: (interval) => {
    set({ interval });
    persist(get);
  },
  swapPlaces: () => {
    const { origin, destination } = get();
    set({ origin: destination, destination: origin });
    persist(get);
  },
  setFormCollapsed: (collapsed) => set({ formCollapsed: collapsed }),
  hydrate: () => {
    const stored = loadPlanFromStorage();
    if (!stored) return;
    set({
      origin: stored.origin,
      destination: stored.destination,
      departure: stored.departure,
      loadLb: stored.loadLb,
      interval: stored.interval,
    });
  },
  snapshot: () => {
    const s = get();
    return {
      origin: s.origin,
      destination: s.destination,
      departure: s.departure,
      loadLb: s.loadLb,
      interval: s.interval,
    };
  },
}));
