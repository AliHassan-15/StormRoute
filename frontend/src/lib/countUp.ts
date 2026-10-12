import { COUNT_UP_DURATION_MS } from "@/lib/constants";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Animate a numeric value from 0 to `target` once (≤300 ms).
 * Calls `onFrame` with the current display value; units match `target`.
 */
export function runCountUp(
  target: number,
  onFrame: (value: number) => void,
  durationMs = COUNT_UP_DURATION_MS,
): () => void {
  if (!Number.isFinite(target) || prefersReducedMotion() || durationMs <= 0) {
    onFrame(target);
    return () => undefined;
  }
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - (1 - t) * (1 - t);
    onFrame(target * eased);
    if (t < 1) raf = requestAnimationFrame(tick);
    else onFrame(target);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
