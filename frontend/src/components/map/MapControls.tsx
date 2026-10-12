import { Expand, LocateFixed, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Z_MAP_OVERLAY } from "@/lib/constants";

export function MapControls({
  onZoomIn,
  onZoomOut,
  onRecenter,
  onFullscreen,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onFullscreen: () => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute left-3 top-14 flex flex-col gap-2 md:left-4 md:top-16"
      style={{ zIndex: Z_MAP_OVERLAY }}
      data-testid="map-controls"
    >
      <div className="flex flex-col overflow-hidden rounded-[var(--radius-control)] border border-border bg-[var(--sr-glass-bg)] shadow-soft backdrop-blur-xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 rounded-none"
          aria-label="Zoom in"
          onClick={onZoomIn}
        >
          <Plus className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 rounded-none border-t border-border"
          aria-label="Zoom out"
          onClick={onZoomOut}
        >
          <Minus className="size-4" aria-hidden />
        </Button>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label="Recenter map on routes"
        onClick={onRecenter}
      >
        <LocateFixed className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label="Toggle fullscreen"
        onClick={onFullscreen}
      >
        <Expand className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
