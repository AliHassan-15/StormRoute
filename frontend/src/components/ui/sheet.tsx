import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, HTMLAttributes } from "react";
import { Drawer } from "vaul";

import { cn } from "@/lib/utils";

export const Sheet = Drawer.Root;
export const SheetTrigger = Drawer.Trigger;
export const SheetClose = Drawer.Close;

export function SheetContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Drawer.Content>) {
  return (
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-50 bg-black/45" />
      <Drawer.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[96vh] flex-col rounded-t-[var(--radius-panel)] border border-border bg-surface outline-none",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-border" />
        <Drawer.Close className="absolute right-3 top-3 rounded-[8px] p-1 text-text-muted hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </Drawer.Close>
        {children}
      </Drawer.Content>
    </Drawer.Portal>
  );
}

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-2 pt-3", className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Drawer.Title>) {
  return <Drawer.Title className={cn("text-md font-semibold", className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Drawer.Description>) {
  return <Drawer.Description className={cn("text-sm text-text-muted", className)} {...props} />;
}

export function SheetBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-auto px-4 pb-6", className)} {...props} />;
}
