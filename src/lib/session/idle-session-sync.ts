/**
 * Cross-tab idle session coordination + inactivity sign-in message.
 */

import { evaluateIdleState } from "@/lib/session/idle-timeout";

export const IDLE_SYNC_CHANNEL = "fmv-idle-session";
export const IDLE_LOGOUT_REASON_KEY = "fmv:idle-logout-reason";
export const IDLE_LAST_ACTIVITY_KEY = "fmv:idle-last-activity";
/** Clerk session id bound to the current idle clock (localStorage). */
export const IDLE_AUTH_SESSION_KEY = "fmv:idle-auth-session";

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

export function writeLastActivityAt(at = Date.now()): void {
  try {
    localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, String(at));
  } catch {
    // ignore
  }
}

export function clearLastActivityAt(): void {
  try {
    localStorage.removeItem(IDLE_LAST_ACTIVITY_KEY);
  } catch {
    // ignore
  }
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
}

export function clearIdleAuthSessionId(): void {
  try {
    localStorage.removeItem(IDLE_AUTH_SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Fresh activity timestamp for vault entry after ritual / legal, etc. */
export function resetIdleActivityClock(now = Date.now()): number {
  writeLastActivityAt(now);
  return now;
}

/**
 * Resolve lastActivityAt when IdleSessionGuard arms.
 *
 * A new Clerk session never inherits a prior idle clock (including an
 * already-expired timer left from before login). Continuous sessions keep
 * the stored timestamp so backgrounded tabs still warn / log out.
 *
 * When sessionId is not yet known, discard residual warn/logout state
 * silently so a login race cannot flash the expired dialog.
 */
export function bootstrapIdleActivityForAuthSession(
  sessionId: string | null | undefined,
  now = Date.now(),
): number {
  if (!sessionId) {
    const stored = readLastActivityAt();
    if (stored == null) {
      writeLastActivityAt(now);
      return now;
    }
    if (evaluateIdleState(stored, now).action !== "none") {
      writeLastActivityAt(now);
      return now;
    }
    return stored;
  }

  const bound = readIdleAuthSessionId();
  if (bound !== sessionId) {
    writeLastActivityAt(now);
    writeIdleAuthSessionId(sessionId);
    return now;
  }

  const stored = readLastActivityAt();
  if (stored == null) {
    writeLastActivityAt(now);
    return now;
  }
  return stored;
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
        const parsed = JSON.parse(event.newValue) as { reason?: string; at?: number };
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

/** Notify this tab + peers that the user did something meaningful. */
let lastNotifyAt = 0;
export function notifyUserActivity(): void {
  const at = Date.now();
  if (at - lastNotifyAt < 1_000) return;
  lastNotifyAt = at;
  writeLastActivityAt(at);
  broadcastIdleSync({ type: "activity", at });
  window.dispatchEvent(
    new CustomEvent("fmv:user-activity", { detail: { at } }),
  );
}
