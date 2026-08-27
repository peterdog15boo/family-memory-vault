/**
 * Session timeout: ~2h idle + 12h hard max lifetime.
 * Warning near the end of idle; secure logout if the user does not confirm.
 *
 * Timers alone are not reliable when tabs are backgrounded or mobile pages suspend —
 * always recompute from lastActivityAt / sessionStartedAt on resume.
 */

/** Idle logout after this much wall-clock time without activity. */
export const IDLE_TOTAL_MS = 2 * 60 * 60 * 1000;
/** “Are you still there?” window before idle logout. */
export const IDLE_LOGOUT_GRACE_MS = 10 * 60 * 1000;
/** Idle duration at which the warning starts. */
export const IDLE_WARNING_MS = IDLE_TOTAL_MS - IDLE_LOGOUT_GRACE_MS;
/** Hard cap from session start — even if the user stays active. */
export const SESSION_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;
/** Persist / broadcast activity at most this often. */
export const IDLE_ACTIVITY_HEARTBEAT_MS = 60 * 1000;
/** Extra wait after grace when uploads/movie renders are still running, then force logout. */
export const IDLE_CRITICAL_FORCE_MS = 2 * 60 * 1000;

export const IDLE_ACTIVITY_EVENTS = [
  "mousedown",
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

export type SessionExpiryDecision =
  | { action: "none"; idleMs: number; sessionAgeMs: number }
  | {
      action: "warn";
      idleMs: number;
      sessionAgeMs: number;
      graceRemainingMs: number;
    }
  | {
      action: "logout";
      idleMs: number;
      sessionAgeMs: number;
      reason: "idle" | "max_lifetime";
    };

/**
 * Pure idle decision from lastActivityAt (wall-clock), not from timer firings.
 * - idle < warning → none
 * - warning ≤ idle < total → warn with residual grace
 * - idle ≥ total → logout
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

export function isSessionMaxLifetimeExpired(
  sessionStartedAt: number,
  now = Date.now(),
): boolean {
  return Math.max(0, now - sessionStartedAt) >= SESSION_MAX_LIFETIME_MS;
}

/**
 * Combined idle + max-lifetime decision.
 * Max lifetime wins even if the user is still active.
 */
export function evaluateSessionExpiry(opts: {
  lastActivityAt: number;
  sessionStartedAt: number;
  now?: number;
  /** When false, only the 12h hard cap is enforced. */
  checkIdle?: boolean;
}): SessionExpiryDecision {
  const now = opts.now ?? Date.now();
  const idleMs = Math.max(0, now - opts.lastActivityAt);
  const sessionAgeMs = Math.max(0, now - opts.sessionStartedAt);

  if (isSessionMaxLifetimeExpired(opts.sessionStartedAt, now)) {
    return {
      action: "logout",
      idleMs,
      sessionAgeMs,
      reason: "max_lifetime",
    };
  }

  if (opts.checkIdle === false) {
    return { action: "none", idleMs, sessionAgeMs };
  }

  const idle = evaluateIdleState(opts.lastActivityAt, now);
  if (idle.action === "logout") {
    return { action: "logout", idleMs, sessionAgeMs, reason: "idle" };
  }
  if (idle.action === "warn") {
    return {
      action: "warn",
      idleMs,
      sessionAgeMs,
      graceRemainingMs: idle.graceRemainingMs,
    };
  }
  return { action: "none", idleMs, sessionAgeMs };
}

/** Ms until the next threshold (warning, idle logout, or max lifetime). */
export function msUntilNextIdleCheck(
  lastActivityAt: number,
  now = Date.now(),
  sessionStartedAt?: number,
): number {
  const idleDecision = evaluateIdleState(lastActivityAt, now);
  let idleWait = 0;
  if (idleDecision.action === "none") {
    idleWait = Math.max(0, IDLE_WARNING_MS - idleDecision.idleMs);
  } else if (idleDecision.action === "warn") {
    idleWait = idleDecision.graceRemainingMs;
  } else {
    idleWait = 0;
  }

  if (sessionStartedAt == null) return idleWait;

  const ageMs = Math.max(0, now - sessionStartedAt);
  const lifetimeWait = Math.max(0, SESSION_MAX_LIFETIME_MS - ageMs);
  if (idleDecision.action === "logout") return 0;
  return Math.min(idleWait, lifetimeWait);
}
