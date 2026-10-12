import { Keyboard, Monitor, Moon, Palette, Sun } from "lucide-react";
import { Link } from "react-router-dom";

import { HowRiskDialog } from "@/components/help/HowRiskDialog";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Z_MAP_OVERLAY } from "@/lib/constants";
import type { ThemeMode } from "@/lib/theme";
import { useUiStore } from "@/store/uiStore";

const ICONS: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function TopToolbar() {
  const themeMode = useUiStore((state) => state.themeMode);
  const cycleTheme = useUiStore((state) => state.cycleTheme);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const Icon = ICONS[themeMode];

  return (
    <GlassPanel
      className="pointer-events-auto absolute right-4 top-4 flex w-auto items-center gap-1 p-1.5 sm:gap-2"
      style={{ zIndex: Z_MAP_OVERLAY }}
      data-testid="top-toolbar"
    >
      <HowRiskDialog />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard shortcuts"
            data-testid="shortcuts-trigger"
          >
            <Keyboard className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Shortcuts (?)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={cycleTheme}
            aria-label={`Theme: ${themeMode}. Click to cycle.`}
            data-testid="theme-toggle"
          >
            <Icon className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Theme: {themeMode}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="hidden min-h-11 min-w-11 sm:inline-flex"
          >
            <Link to="/design" aria-label="Design system">
              <Palette className="size-4" aria-hidden />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Design system</TooltipContent>
      </Tooltip>
    </GlassPanel>
  );
}
