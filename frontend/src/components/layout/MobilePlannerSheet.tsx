import * as React from "react";
import { Drawer } from "vaul";

import { PlannerPanelContent } from "@/components/layout/PlannerPanelContent";
import { StormRouteWordmark } from "@/brand/StormRouteWordmark";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const SNAP_POINTS = [0.22, 0.5, 0.92] as const;

/** Mobile planner panel as a vaul sheet with peek / half / full snaps. */
export function MobilePlannerSheet() {
  // Open enough that the planner form is usable without an initial drag.
  const [snap, setSnap] = React.useState<number | string | null>(SNAP_POINTS[2]);
  // Only mount below md — an always-open vaul drawer sets aria-hidden on siblings.
  const isMobile = useMediaQuery("(max-width: 767px)");
  if (!isMobile) return null;

  return (
    <div className="md:hidden">
      <Drawer.Root
        open
        dismissible={false}
        modal={false}
        snapPoints={[...SNAP_POINTS]}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
      >
        <Drawer.Portal>
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-30 flex h-full max-h-[96%] flex-col rounded-t-[var(--radius-panel)] border border-border bg-[var(--sr-glass-bg)] outline-none backdrop-blur-xl"
            data-testid="mobile-planner-sheet"
          >
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border" />
            <Drawer.Title className="sr-only">Route planner</Drawer.Title>
            <Drawer.Description className="sr-only">
              Enter origin, destination, departure, and load weight
            </Drawer.Description>
            <div className="border-b border-border px-4 py-3 md:hidden">
              <StormRouteWordmark compact />
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <PlannerPanelContent />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
}
