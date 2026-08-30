/**
 * Cross-tab idle session coordination + inactivity sign-in message.
 */

import {
  clearIdleActivityCookie,
  writeIdleActivityCookie,
} from "@/lib/session/idle-session-cookie";
import {
  evaluateIdleState,
  evaluateSessionExpiry,
  IDLE_ACTIVITY_HEARTBEAT_MS,
} from "@/lib/session/idle-timeout";

export const IDLE_SYNC_CHANNEL = "fmv-idle-session";
export const IDLE_LOGOUT_REASON_KEY = "fmv:idle-logout-reason";
export const IDLE_LAST_ACTIVITY_KEY = "fmv:idle-last-activity";
/** Wall-clock start of the current Clerk session binding (localStorage). */
export const IDLE_SESSION_STARTED_KEY = "fmv:idle-session-started";
/** Clerk session id bound to the current idle clock (localStorage). */
export const IDLE_AUTH_SESSION_KEY = "fmv:idle-auth-session";
/** Wall-clock when the “Are you still there?” dialog was shown this idle period. */
export const IDLE_WARNING_SHOWN_KEY = "fmv:idle-warning-shown";
/**
 * Client preference mirror for paid users who disabled idle timeout.
 * Missing / anything other than "0" → treat as enabled (free default).
 */
export const IDLE_TIMEOUT_ENABLED_KEY = "fmv:idle-timeout-enabled";

export type IdleSyncMessage =
  | { type: "activity"; at: number }
  | { type: "stay"; at: number }
  | { type: "logout"; reason: "inactivity"; at: number };

export function inactivitySignInPath(): string {
  return "/sign-in?reason=inactivity";
}

/** Persist a one-shot flag so sign-in can show the inactivity message. */
export function markInactivityLogout(): void {
  try {
    localStorage.setItem(
      IDLE_LOGOUT_REASON_KEY,
      JSON.stringify({ reason: "inactivity", at: Date.now() }),
    );
  } catch {
    // private mode / quota
  }
}

/** Returns true once if the user was signed out for inactivity (clears the flag). */
export function consumeInactivityLogoutFlag(): boolean {
  try {
    const raw = localStorage.getItem(IDLE_LOGOUT_REASON_KEY);
    localStorage.removeItem(IDLE_LOGOUT_REASON_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { reason?: string };
    return parsed.reason === "inactivity";
  } catch {
    try {
      localStorage.removeItem(IDLE_LOGOUT_REASON_KEY);
    } catch {
      // ignore
    }
    return false;
  }
}

export function readIdleTimeoutEnabledPreference(): boolean {
  try {
    return localStorage.getItem(IDLE_TIMEOUT_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeIdleTimeoutEnabledPreference(enabled: boolean): void {
  try {
    localStorage.setItem(IDLE_TIMEOUT_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
  syncIdleActivityCookie(readLastActivityAt() ?? Date.now());
}

function syncIdleActivityCookie(at: number): void {
  const sessionId = readIdleAuthSessionId();
  if (!sessionId) {
    clearIdleActivityCookie();
    return;
  }
  const startedAt = readSessionStartedAt() ?? at;
  writeIdleActivityCookie(
    sessionId,
    at,
    startedAt,
    readIdleTimeoutEnabledPreference(),
    readWarningShownAt(),
  );
}

export function writeLastActivityAt(at = Date.now()): void {
  try {
    localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, String(at));
  } catch {
    // ignore
  }
  syncIdleActivityCookie(at);
}

export function clearLastActivityAt(): void {
  try {
    localStorage.removeItem(IDLE_LAST_ACTIVITY_KEY);
  } catch {
    // ignore
  }
  clearWarningShownAt();
  clearIdleActivityCookie();
}

export function readLastActivityAt(): number | null {
  try {
    const raw = localStorage.getItem(IDLE_LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function readWarningShownAt(): number | null {
  try {
    const raw = localStorage.getItem(IDLE_WARNING_SHOWN_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeWarningShownAt(at = Date.now()): void {
  try {
    localStorage.setItem(IDLE_WARNING_SHOWN_KEY, String(at));
  } catch {
    // ignore
  }
  syncIdleActivityCookie(readLastActivityAt() ?? at);
}

export function clearWarningShownAt(): void {
  try {
    localStorage.removeItem(IDLE_WARNING_SHOWN_KEY);
  } catch {
    // ignore
  }
}

export function readSessionStartedAt(): number | null {
  try {
    const raw = localStorage.getItem(IDLE_SESSION_STARTED_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writeSessionStartedAt(at: number): void {
  try {
    localStorage.setItem(IDLE_SESSION_STARTED_KEY, String(at));
  } catch {
    // ignore
  }
  syncIdleActivityCookie(readLastActivityAt() ?? at);
}

export function clearSessionStartedAt(): void {
  try {
    localStorage.removeItem(IDLE_SESSION_STARTED_KEY);
  } catch {
    // ignore
  }
}

export function readIdleAuthSessionId(): string | null {
  try {
    return localStorage.getItem(IDLE_AUTH_SESSION_KEY);
  } catch {
    return null;
  }
}

export function writeIdleAuthSessionId(sessionId: string): void {
  try {
    localStorage.setItem(IDLE_AUTH_SESSION_KEY, sessionId);
  } catch {
    // ignore
  }
  const at = readLastActivityAt() ?? Date.now();
  syncIdleActivityCookie(at);
}

export function clearIdleAuthSessionId(): void {
  try {
    localStorage.removeItem(IDLE_AUTH_SESSION_KEY);
  } catch {
    // ignore
  }
  clearSessionStartedAt();
  clearWarningShownAt();
  clearIdleActivityCookie();
}

/** Clerk sign-out: drop the idle clock so the next login does not inherit it. */
export function clearIdleSessionState(): void {
  clearLastActivityAt();
  clearIdleAuthSessionId();
}

/**
 * Brand-new Clerk session / just-logged-in: start a fresh 15-minute clock.
 * Never evaluate yesterday's lastActivity on this event.
 */
export function beginFreshIdleClock(
  sessionId: string,
  now = Date.now(),
): BootstrapIdleResult {
  clearWarningShownAt();
  writeSessionStartedAt(now);
  writeLastActivityAt(now);
  writeIdleAuthSessionId(sessionId);
  return { lastActivityAt: now, sessionStartedAt: now };
}

/** Fresh activity timestamp for vault entry after ritual / legal, etc. */
export function resetIdleActivityClock(now = Date.now()): number {
  clearWarningShownAt();
  writeLastActivityAt(now);
  return now;
}

/**
 * Continuous Clerk session past idle logout and/or 12h max lifetime.
 * Used for silent sign-out before vault UI paints (no warning dialog).
 */
export function shouldSilentExpireIdleSession(
  sessionId: string | null | undefined,
  now = Date.now(),
  opts?: { checkIdle?: boolean },
): boolean {
  if (!sessionId) return false;
  const bound = readIdleAuthSessionId();
  if (bound !== sessionId) return false;

  const startedAt = readSessionStartedAt();
  const stored = readLastActivityAt();
  if (startedAt == null && stored == null) return false;

  const lastActivityAt = stored ?? startedAt ?? now;
  const sessionStartedAt = startedAt ?? lastActivityAt;
  const checkIdle =
    opts?.checkIdle !== false && readIdleTimeoutEnabledPreference();

  return (
    evaluateSessionExpiry({
      lastActivityAt,
      sessionStartedAt,
      now,
      checkIdle,
      warningShownAt: readWarningShownAt(),
      resume: true,
    }).action === "logout"
  );
}

/**
 * Clear idle clocks + mark inactivity, then caller should Clerk signOut.
 */
export function prepareSilentIdleExpiry(): void {
  markInactivityLogout();
  clearLastActivityAt();
  clearIdleAuthSessionId();
}

export type BootstrapIdleResult = {
  lastActivityAt: number;
  sessionStartedAt: number;
};

/**
 * Resolve lastActivityAt + sessionStartedAt when IdleSessionGuard / resume gate arms.
 *
 * A new Clerk session never inherits a prior idle clock (beginFreshIdleClock).
 * Continuous sessions keep stored timestamps so overnight / backgrounded tabs
 * still expire. Missing lastActivityAt (first run after deploy) starts now.
 *
 * When sessionId is not yet known, do not rewrite a stored stamp — that is what
 * revived overnight tabs. Wait for Clerk, then expire or continue.
 */
export function bootstrapIdleActivityForAuthSession(
  sessionId: string | null | undefined,
  now = Date.now(),
): number {
  return bootstrapSessionClocks(sessionId, now).lastActivityAt;
}

export function bootstrapSessionClocks(
  sessionId: string | null | undefined,
  now = Date.now(),
): BootstrapIdleResult {
  if (!sessionId) {
    const stored = readLastActivityAt();
    const started = readSessionStartedAt() ?? stored;
    if (stored == null) {
      writeSessionStartedAt(now);
      writeLastActivityAt(now);
      return { lastActivityAt: now, sessionStartedAt: now };
    }
    if (readSessionStartedAt() == null && started != null) {
      writeSessionStartedAt(started);
    }
    return { lastActivityAt: stored, sessionStartedAt: started ?? stored };
  }

  const bound = readIdleAuthSessionId();
  if (bound !== sessionId) {
    return beginFreshIdleClock(sessionId, now);
  }

  const stored = readLastActivityAt();
  const started = readSessionStartedAt();
  if (stored == null) {
    const sessionStartedAt = started ?? now;
    writeSessionStartedAt(sessionStartedAt);
    writeLastActivityAt(now);
    writeIdleAuthSessionId(sessionId);
    return { lastActivityAt: now, sessionStartedAt };
  }

  if (started == null) writeSessionStartedAt(stored);
  writeIdleAuthSessionId(sessionId);
  return { lastActivityAt: stored, sessionStartedAt: started ?? stored };
}

type IdleSyncHandler = (message: IdleSyncMessage) => void;

/**
 * Subscribe to cross-tab idle events (BroadcastChannel + storage fallback).
 */
export function subscribeIdleSync(handler: IdleSyncHandler): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(IDLE_SYNC_CHANNEL);
    channel.onmessage = (event: MessageEvent<IdleSyncMessage>) => {
      if (event.data && typeof event.data === "object" && "type" in event.data) {
        handler(event.data);
      }
    };
  } catch {
    channel = null;
  }

  function onStorage(event: StorageEvent) {
    if (event.key === IDLE_LOGOUT_REASON_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue) as {
          reason?: string;
          at?: number;
        };
        if (parsed.reason === "inactivity") {
          handler({
            type: "logout",
            reason: "inactivity",
            at: parsed.at ?? Date.now(),
          });
        }
      } catch {
        // ignore
      }
    }
    if (event.key === IDLE_LAST_ACTIVITY_KEY && event.newValue) {
      const at = Number(event.newValue);
      if (Number.isFinite(at)) {
        handler({ type: "activity", at });
      }
    }
  }

  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("storage", onStorage);
    try {
      channel?.close();
    } catch {
      // ignore
    }
  };
}

export function broadcastIdleSync(message: IdleSyncMessage): void {
  try {
    const channel = new BroadcastChannel(IDLE_SYNC_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel unsupported — storage events still cover logout/activity.
  }

  if (message.type === "activity" || message.type === "stay") {
    clearWarningShownAt();
    writeLastActivityAt(message.at);
  }
  if (message.type === "logout") {
    markInactivityLogout();
    clearIdleSessionState();
  }
}

/**
 * Notify this tab + peers that the user did something meaningful.
 * Persist / broadcast at most once per minute (heartbeat).
 */
let lastNotifyAt = 0;
export function notifyUserActivity(): void {
  const at = Date.now();
  const stored = readLastActivityAt();
  if (stored != null) {
    const idle = evaluateIdleState(stored, at, readWarningShownAt(), {
      resume: true,
    });
    if (idle.action === "logout") {
      return;
    }
  }
  if (at - lastNotifyAt < IDLE_ACTIVITY_HEARTBEAT_MS) return;
  lastNotifyAt = at;
  clearWarningShownAt();
  writeLastActivityAt(at);
  broadcastIdleSync({ type: "activity", at });
  window.dispatchEvent(
    new CustomEvent("fmv:user-activity", { detail: { at } }),
  );
}
