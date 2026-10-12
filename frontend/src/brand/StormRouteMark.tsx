import { cn } from "@/lib/utils";

export interface StormRouteMarkProps {
  className?: string;
  title?: string;
}

/** Custom StormRoute mark: route polyline, node, and weather-pulse ring. */
export function StormRouteMark({ className, title = "StormRoute" }: StormRouteMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-8 shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle
        cx="28"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1.5"
        className="text-accent"
      />
      <circle
        cx="28"
        cy="12"
        r="5.5"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.25"
        className="text-accent"
      />
      <path
        d="M6 30 C10 22, 14 24, 18 18 C21 13, 23 14, 28 12"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        className="text-accent"
      />
      <circle cx="6" cy="30" r="2.2" className="fill-brand" />
      <circle cx="28" cy="12" r="3" className="fill-accent" />
      <circle cx="28" cy="12" r="1.2" className="fill-accent-contrast" />
    </svg>
  );
}
