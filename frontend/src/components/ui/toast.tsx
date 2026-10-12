import { Toaster as Sonner } from "sonner";

import { useUiStore } from "@/store/uiStore";

export function Toaster() {
  const theme = useUiStore((state) => state.resolvedTheme);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group glass-panel !border-border !bg-[var(--sr-glass-bg)] !text-text !shadow-panel",
          description: "!text-text-muted",
          actionButton: "!bg-accent !text-accent-contrast",
          cancelButton: "!bg-surface-raised !text-text",
        },
      }}
      position="top-center"
      closeButton
    />
  );
}

