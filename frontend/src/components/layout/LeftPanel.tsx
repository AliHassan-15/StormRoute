import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion } from "framer-motion";

import { StormRouteMark } from "@/brand/StormRouteMark";
import { PlannerPanelContent } from "@/components/layout/PlannerPanelContent";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cardSpring, motionSafe } from "@/lib/motion";
import { useUiStore } from "@/store/uiStore";

/** Desktop planner column — sibling of the map, never overlays it. */
export function LeftPanel() {
  const collapsed = useUiStore((state) => state.leftPanelCollapsed);
  const setCollapsed = useUiStore((state) => state.setLeftPanelCollapsed);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  if (!isDesktop) return null;

  return (
    <motion.aside
      className="relative z-10 flex h-full shrink-0 flex-col border-r border-border/80 bg-surface shadow-[4px_0_24px_rgba(0,0,0,0.18)]"
      initial={false}
      animate={{ width: collapsed ? 64 : 400 }}
      transition={motionSafe(cardSpring)}
      data-testid="left-panel"
    >
      {collapsed ? (
        <div className="flex h-full flex-col items-center gap-3 p-2 pt-4">
          <StormRouteMark className="size-8" />
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={() => setCollapsed(false)}
            aria-label="Expand planner panel"
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="relative flex h-full min-h-0 flex-col">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 z-10 min-h-10 min-w-10"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse planner panel"
          >
            <PanelLeftClose className="size-4" />
          </Button>
          <PlannerPanelContent />
        </div>
      )}
    </motion.aside>
  );
}
