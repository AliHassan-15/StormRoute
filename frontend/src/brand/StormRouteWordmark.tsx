import { StormRouteMark } from "@/brand/StormRouteMark";
import { cn } from "@/lib/utils";

export interface StormRouteWordmarkProps {
  className?: string;
  compact?: boolean;
}

export function StormRouteWordmark({ className, compact = false }: StormRouteWordmarkProps) {
  return (
    <div className={cn("flex items-center gap-2 text-text", className)}>
      <StormRouteMark className={compact ? "size-7" : "size-8"} />
      <div className="flex flex-col leading-none">
        <span
          className={cn(
            "font-semibold tracking-tight text-text",
            compact ? "text-base" : "text-lg",
          )}
        >
          StormRoute
        </span>
        {!compact ? (
          <span className="mt-1 text-xs text-text-muted">Weather-aware routing</span>
        ) : null}
      </div>
    </div>
  );
}
