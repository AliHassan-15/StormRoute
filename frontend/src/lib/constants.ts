/** Shared UI / network constants (units in names). */

export const TAP_TARGET_MIN_PX = 44;
export const COUNT_UP_DURATION_MS = 280;
export const PAGE_ENTER_DURATION_MS = 220;
export const HOVER_DURATION_MS = 150;
export const PANEL_DURATION_MS = 220;

/** Idempotent GET retry policy. */
export const GET_RETRY_MAX = 3;
export const GET_RETRY_BASE_MS = 400;

/** Default wait when upstream returns 429 without Retry-After. */
export const RATE_LIMIT_DEFAULT_S = 30;

export const Z_MAP = 0;
export const Z_MAP_OVERLAY = 20;
export const Z_DRAWER = 40;
export const Z_BANNER = 45;
export const Z_MODAL = 50;
export const Z_TOAST = 60;
