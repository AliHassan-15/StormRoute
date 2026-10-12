import { create } from "zustand";

import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme";

interface UiState {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  leftPanelCollapsed: boolean;
  howRiskOpen: boolean;
  shortcutsOpen: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  cycleTheme: () => void;
  setLeftPanelCollapsed: (collapsed: boolean) => void;
  setHowRiskOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  hydrateTheme: () => void;
}

const cycle: ThemeMode[] = ["system", "light", "dark"];

export const useUiStore = create<UiState>((set, get) => ({
  themeMode: "system",
  resolvedTheme: "dark",
  leftPanelCollapsed: false,
  howRiskOpen: false,
  shortcutsOpen: false,
  setThemeMode: (mode) => {
    persistTheme(mode);
    const resolved = applyTheme(mode);
    set({ themeMode: mode, resolvedTheme: resolved });
  },
  cycleTheme: () => {
    const current = get().themeMode;
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length] ?? "system";
    get().setThemeMode(next);
  },
  setLeftPanelCollapsed: (collapsed) => set({ leftPanelCollapsed: collapsed }),
  setHowRiskOpen: (open) => set({ howRiskOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  hydrateTheme: () => {
    const mode = readStoredTheme();
    const resolved = applyTheme(mode);
    set({ themeMode: mode, resolvedTheme: resolved });
  },
}));

export function syncResolvedThemeFromSystem(): void {
  const { themeMode, setThemeMode } = useUiStore.getState();
  if (themeMode === "system") {
    setThemeMode("system");
  } else {
    useUiStore.setState({ resolvedTheme: resolveTheme(themeMode) });
  }
}
