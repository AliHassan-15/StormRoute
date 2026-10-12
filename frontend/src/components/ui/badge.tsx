import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-chip)] border px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-raised text-text",
        accent: "border-transparent bg-accent/15 text-accent",
        brand: "border-transparent bg-brand/15 text-brand dark:text-accent",
        outline: "border-border bg-transparent text-text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
