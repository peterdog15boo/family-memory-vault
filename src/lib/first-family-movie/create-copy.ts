/**
 * Client-safe copy + timing for First Family Movie create UI.
 * Keep server create logic in create.ts (DB / workers).
 */

export const FFM_CREATE_ANTICIPATION_LINES = [
  "Finding the people in your photos…",
  "Arranging your moments…",
  "Scoring the music…",
  "Almost ready.",
] as const;

/** Soft threshold after which we show the long-wait notification promise. */
export const FFM_LONG_WAIT_MS = 30_000;

export function getCreateAnticipationLine(tick: number): string {
  const lines = FFM_CREATE_ANTICIPATION_LINES;
  const i = ((tick % lines.length) + lines.length) % lines.length;
  return lines[i]!;
}
