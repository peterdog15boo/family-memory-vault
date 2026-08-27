/**
 * Cross-tab idle session coordination + inactivity sign-in message.
 */

import {
  clearIdleActivityCookie,
  writeIdleActivityCookie,
} from "@/lib/session/idle-session-cookie";
import {
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
  clearIdleActivityCookie();
}

/** Fresh activity timestamp for vault entry after ritual / legal, etc. */
export function resetIdleActivityClock(now = Date.now()): number {
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
 * A new Clerk session never inherits a prior idle / lifetime clock. Continuous
 * sessions keep stored timestamps so backgrounded tabs still warn / log out.
 *
 * When sessionId is not yet known, discard residual warn/logout state
 * silently so a login race cannot flash the expired dialog.
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
    const started = readSessionStartedAt() ?? stored ?? now;
    if (stored == null) {
      writeSessionStartedAt(now);
      writeLastActivityAt(now);
      return { lastActivityAt: now, sessionStartedAt: now };
    }
    const checkIdle = readIdleTimeoutEnabledPreference();
    if (
      evaluateSessionExpiry({
        lastActivityAt: stored,
        sessionStartedAt: started,
        now,
        checkIdle,
      }).action !== "none"
    ) {
      writeSessionStartedAt(now);
      writeLastActivityAt(now);
      return { lastActivityAt: now, sessionStartedAt: now };
    }
    if (readSessionStartedAt() == null) writeSessionStartedAt(started);
    return { lastActivityAt: stored, sessionStartedAt: started };
  }

  const bound = readIdleAuthSessionId();
  if (bound !== sessionId) {
    writeSessionStartedAt(now);
    writeLastActivityAt(now);
    writeIdleAuthSessionId(sessionId);
    return { lastActivityAt: now, sessionStartedAt: now };
  }

  const stored = readLastActivityAt();
  const started = readSessionStartedAt();
  if (stored == null || started == null) {
    const lastActivityAt = stored ?? now;
    const sessionStartedAt = started ?? now;
    writeSessionStartedAt(sessionStartedAt);
    writeLastActivityAt(lastActivityAt);
    writeIdleAuthSessionId(sessionId);
    return { lastActivityAt, sessionStartedAt };
  }

  writeIdleAuthSessionId(sessionId);
  return { lastActivityAt: stored, sessionStartedAt: started };
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
    writeLastActivityAt(message.at);
  }
  if (message.type === "logout") {
    markInactivityLogout();
    clearLastActivityAt();
    clearIdleAuthSessionId();
  }
}

/**
 * Notify this tab + peers that the user did something meaningful.
 * Persist / broadcast at most once per minute (heartbeat).
 */
let lastNotifyAt = 0;
export function notifyUserActivity(): void {
  const at = Date.now();
  if (at - lastNotifyAt < IDLE_ACTIVITY_HEARTBEAT_MS) return;
  lastNotifyAt = at;
  writeLastActivityAt(at);
  broadcastIdleSync({ type: "activity", at });
  window.dispatchEvent(
    new CustomEvent("fmv:user-activity", { detail: { at } }),
  );
}
