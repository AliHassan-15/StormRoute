import { create } from "zustand";

interface ViewState {
  selectedRouteId: string | null;
  selectedCheckpointIndex: number | null;
  hoveredRouteId: string | null;
  hoveredSegmentIndex: number | null;
  checkpointDrawerOpen: boolean;
  resultsTab: "routes" | "checkpoints" | "compare";
  setSelectedRouteId: (id: string | null) => void;
  setSelectedCheckpointIndex: (index: number | null) => void;
  openCheckpoint: (index: number) => void;
  closeCheckpointDrawer: () => void;
  setHoveredRouteId: (id: string | null) => void;
  setHoveredSegmentIndex: (index: number | null) => void;
  setResultsTab: (tab: "routes" | "checkpoints" | "compare") => void;
  resetSelection: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  selectedRouteId: null,
  selectedCheckpointIndex: null,
  hoveredRouteId: null,
  hoveredSegmentIndex: null,
  checkpointDrawerOpen: false,
  resultsTab: "routes",
  setSelectedRouteId: (id) =>
    set({
      selectedRouteId: id,
      selectedCheckpointIndex: null,
      checkpointDrawerOpen: false,
      hoveredSegmentIndex: null,
    }),
  setSelectedCheckpointIndex: (index) => set({ selectedCheckpointIndex: index }),
  openCheckpoint: (index) =>
    set({ selectedCheckpointIndex: index, checkpointDrawerOpen: true }),
  closeCheckpointDrawer: () => set({ checkpointDrawerOpen: false }),
  setHoveredRouteId: (id) => set({ hoveredRouteId: id }),
  setHoveredSegmentIndex: (index) => set({ hoveredSegmentIndex: index }),
  setResultsTab: (tab) => set({ resultsTab: tab }),
  resetSelection: () =>
    set({
      selectedRouteId: null,
      selectedCheckpointIndex: null,
      hoveredRouteId: null,
      hoveredSegmentIndex: null,
      checkpointDrawerOpen: false,
      resultsTab: "routes",
    }),
}));
