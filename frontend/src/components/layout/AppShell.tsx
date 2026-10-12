import { lazy, Suspense } from "react";

import { LiveAnnouncer } from "@/components/a11y/LiveAnnouncer";
import { ShortcutsOverlay } from "@/components/help/ShortcutsOverlay";
import { LeftPanel } from "@/components/layout/LeftPanel";
import { MobilePlannerSheet } from "@/components/layout/MobilePlannerSheet";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import { TopToolbar } from "@/components/layout/TopToolbar";
import { MapCanvas } from "@/components/map/MapCanvas";

const HeatmapDock = lazy(async () => {
  const mod = await import("@/components/layout/HeatmapDock");
  return { default: mod.HeatmapDock };
});
const CheckpointDrawer = lazy(async () => {
  const mod = await import("@/components/map/CheckpointDrawer");
  return { default: mod.CheckpointDrawer };
});

export function AppShell() {
  return (
    <div
      className="flex h-dvh w-full overflow-hidden bg-bg"
      data-testid="app-shell"
    >
      <LeftPanel />
      <div
        className="relative min-h-0 min-w-0 flex-1"
        data-testid="map-stage"
      >
        <MapCanvas />
        <OfflineBanner />
        <LiveAnnouncer />
        <TopToolbar />
        <Suspense fallback={null}>
          <HeatmapDock />
          <CheckpointDrawer />
        </Suspense>
      </div>
      <MobilePlannerSheet />
      <ShortcutsOverlay />
    </div>
  );
}
