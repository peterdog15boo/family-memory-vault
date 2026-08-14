/**
 * Bank-style idle session timeout constants + timestamp decision helpers.
 * Warning after idle; secure logout if the user does not confirm within the grace period.
 *
 * Timers alone are not reliable when tabs are backgrounded or mobile pages suspend —
 * always recompute from lastActivityAt on resume (visibility/focus/pageshow).
 */
export const IDLE_WARNING_MS = 15 * 60 * 1000;
export const IDLE_LOGOUT_GRACE_MS = 2 * 60 * 1000;
/** Warning + grace: idle at or beyond this → logout on next check. */
export const IDLE_TOTAL_MS = IDLE_WARNING_MS + IDLE_LOGOUT_GRACE_MS;
/** Extra wait after grace when uploads/movie renders are still running, then force logout. */
export const IDLE_CRITICAL_FORCE_MS = 2 * 60 * 1000;

export const IDLE_ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
  "touchmove",
  "pointerdown",
  "click",
] as const;

/**
 * Media events that indicate real user interaction (not unattended playback).
 * Do not treat `timeupdate` / `playing` as activity — an idle tab with video
 * must still time out.
 */
export const IDLE_MEDIA_INTERACTION_EVENTS = [
  "play",
  "pause",
  "seeked",
  "volumechange",
] as const;

export type IdleCheckDecision =
  | { action: "none"; idleMs: number }
  | { action: "warn"; idleMs: number; graceRemainingMs: number }
  | { action: "logout"; idleMs: number };

/**
 * Pure idle decision from lastActivityAt (wall-clock), not from timer firings.
 * - idle < 15m → none
 * - 15m ≤ idle < 17m → warn with residual grace
 * - idle ≥ 17m → logout
 */
export function evaluateIdleState(
  lastActivityAt: number,
  now = Date.now(),
): IdleCheckDecision {
  const idleMs = Math.max(0, now - lastActivityAt);
  if (idleMs < IDLE_WARNING_MS) {
    return { action: "none", idleMs };
  }
  if (idleMs < IDLE_TOTAL_MS) {
    return {
      action: "warn",
      idleMs,
      graceRemainingMs: IDLE_TOTAL_MS - idleMs,
    };
  }
  return { action: "logout", idleMs };
}

/** Ms until the next threshold (warning or logout), for opportunistic timers. */
export function msUntilNextIdleCheck(
  lastActivityAt: number,
  now = Date.now(),
): number {
  const decision = evaluateIdleState(lastActivityAt, now);
  if (decision.action === "none") {
    return Math.max(0, IDLE_WARNING_MS - decision.idleMs);
  }
  if (decision.action === "warn") {
    return decision.graceRemainingMs;
  }
  return 0;
}
