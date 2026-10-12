import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function GlassPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // Default relative for ::before highlight; callers can override with absolute/fixed.
  return <div className={cn("glass-panel relative", className)} {...props} />;
}
