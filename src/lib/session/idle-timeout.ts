/**
 * Session timeout: 15m idle + 2m “Are you still there?” grace + 12h hard max lifetime.
 *
 * Grace applies only if the warning was already shown in this idle period.
 * Background / locked / closed tabs do not pause the clock — returning after
 * 15m without a warning is an immediate sign-out.
 *
 * Timers alone are not reliable when tabs are backgrounded or mobile pages suspend —
 * always recompute from lastActivityAt / sessionStartedAt on resume.
 */

/** Idle duration at which the warning starts (visible tab) or silent logout (no warning). */
export const IDLE_WARNING_MS = 15 * 60 * 1000;
/** “Are you still there?” window after the warning was shown. */
export const IDLE_LOGOUT_GRACE_MS = 2 * 60 * 1000;
/** Idle logout once warning + grace have elapsed. */
export const IDLE_TOTAL_MS = IDLE_WARNING_MS + IDLE_LOGOUT_GRACE_MS;
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

function warningAppliesThisPeriod(
  lastActivityAt: number,
  warningShownAt: number | null | undefined,
): boolean {
  return (
    warningShownAt != null &&
    Number.isFinite(warningShownAt) &&
    warningShownAt >= lastActivityAt
  );
}

/**
 * Pure idle decision from lastActivityAt (wall-clock), not from timer firings.
 * - idle < 15m → none
 * - idle ≥ 17m → logout
 * - 15m ≤ idle < 17m:
 *   - visible watcher (resume: false) → warn (then persist warningShownAt)
 *   - resume/focus/navigation without a warning this period → logout
 *   - resume with warning this period → warn (remaining grace)
 */
export function evaluateIdleState(
  lastActivityAt: number,
  now = Date.now(),
  warningShownAt: number | null = null,
  opts?: { resume?: boolean },
): IdleCheckDecision {
  const idleMs = Math.max(0, now - lastActivityAt);
  if (idleMs < IDLE_WARNING_MS) {
    return { action: "none", idleMs };
  }
  if (idleMs < IDLE_TOTAL_MS) {
    if (
      warningAppliesThisPeriod(lastActivityAt, warningShownAt) ||
      !opts?.resume
    ) {
      return {
        action: "warn",
        idleMs,
        graceRemainingMs: IDLE_TOTAL_MS - idleMs,
      };
    }
    return { action: "logout", idleMs };
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
  /** Warning timestamp for this idle period; required for the 2m grace. */
  warningShownAt?: number | null;
  /**
   * True for focus / visibility / navigation resume: 15m idle without a
   * warning this period is an immediate logout.
   */
  resume?: boolean;
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

  const idle = evaluateIdleState(
    opts.lastActivityAt,
    now,
    opts.warningShownAt ?? null,
    { resume: opts.resume },
  );
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
  warningShownAt: number | null = null,
): number {
  const idleDecision = evaluateIdleState(lastActivityAt, now, warningShownAt);
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
