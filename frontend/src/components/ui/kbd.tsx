import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded-[8px] border border-border bg-surface-raised px-1.5 font-mono text-xs text-text-muted shadow-soft",
        className,
      )}
      {...props}
    />
  );
}
