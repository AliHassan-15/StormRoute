import * as React from "react";

import { Kbd } from "@/components/ui/kbd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUiStore } from "@/store/uiStore";

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["?"], action: "Show this shortcuts list" },
  { keys: ["←", "→"], action: "Heatmap slider ±1 hour" },
  { keys: ["Shift", "←/→"], action: "Heatmap slider ±6 hours" },
  { keys: ["Home", "End"], action: "Heatmap hour 0 / 48" },
  { keys: ["Space"], action: "Play / pause heatmap" },
  { keys: ["Esc"], action: "Close checkpoint drawer or dialog" },
  { keys: ["↑", "↓"], action: "Move between checkpoints in the drawer" },
];

/** Global keyboard shortcuts overlay (press ?). */
export function ShortcutsOverlay() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-testid="shortcuts-overlay" className="w-[min(92vw,28rem)]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Slider, drawer, and global keys. Press Esc to close.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {SHORTCUTS.map((row) => (
            <li
              key={row.action}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-text-muted">{row.action}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {row.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
