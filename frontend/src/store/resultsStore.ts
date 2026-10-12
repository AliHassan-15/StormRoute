import { create } from "zustand";

import type { AnalyzeResponse } from "@/api/schemas";

interface ResultsState {
  data: AnalyzeResponse | null;
  error: unknown;
  setData: (data: AnalyzeResponse | null) => void;
  setError: (error: unknown) => void;
  clear: () => void;
}

export const useResultsStore = create<ResultsState>((set) => ({
  data: null,
  error: null,
  setData: (data) => set({ data, error: null }),
  setError: (error) => set({ error, data: null }),
  clear: () => set({ data: null, error: null }),
}));
