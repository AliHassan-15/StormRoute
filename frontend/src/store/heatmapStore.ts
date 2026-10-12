import { create } from "zustand";

import type { HeatmapResponse } from "@/api/schemas";
import type { HeatLayerKey } from "@/lib/heatmap/normalize";

export type HeatmapStatus = "idle" | "loading" | "ready" | "error";
export type HeatmapSpeed = 1 | 2 | 4;

interface HeatmapState {
  status: HeatmapStatus;
  error: string | null;
  data: HeatmapResponse | null;
  hour: number;
  layer: HeatLayerKey;
  playing: boolean;
  speed: HeatmapSpeed;
  visible: boolean;
  setStatus: (status: HeatmapStatus, error?: string | null) => void;
  setData: (data: HeatmapResponse | null) => void;
  setHour: (hour: number) => void;
  setLayer: (layer: HeatLayerKey) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: HeatmapSpeed) => void;
  setVisible: (visible: boolean) => void;
  reset: () => void;
}

const initial = {
  status: "idle" as HeatmapStatus,
  error: null as string | null,
  data: null as HeatmapResponse | null,
  hour: 0,
  layer: "risk" as HeatLayerKey,
  playing: false,
  speed: 1 as HeatmapSpeed,
  visible: true,
};

export const useHeatmapStore = create<HeatmapState>((set) => ({
  ...initial,
  setStatus: (status, error = null) => set({ status, error }),
  setData: (data) =>
    set({
      data,
      status: data ? "ready" : "idle",
      error: null,
      hour: 0,
      playing: false,
    }),
  setHour: (hour) =>
    set({ hour: Math.min(48, Math.max(0, Math.round(hour))) }),
  setLayer: (layer) => set({ layer }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setVisible: (visible) => set({ visible }),
  reset: () => set({ ...initial }),
}));
