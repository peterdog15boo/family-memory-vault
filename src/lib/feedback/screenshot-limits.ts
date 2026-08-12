/**
 * Shared screenshot size limits (client + server safe — no DOM APIs).
 */

/** Soft cap after compression — keep POST bodies modest. */
export const FEEDBACK_SCREENSHOT_MAX_BYTES = 1_800_000;
