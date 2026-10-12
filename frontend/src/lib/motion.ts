import type { Transition } from "framer-motion";

import { HOVER_DURATION_MS, PANEL_DURATION_MS } from "@/lib/constants";

export const MOTION_HOVER_MS = HOVER_DURATION_MS;
export const MOTION_PANEL_MS = PANEL_DURATION_MS;

export const panelTransition: Transition = {
  duration: MOTION_PANEL_MS / 1000,
  ease: [0.2, 0.8, 0.2, 1],
};

export const cardSpring: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 32,
};

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function motionSafe<T extends Transition>(transition: T): Transition {
  return prefersReducedMotion() ? { duration: 0 } : transition;
}
