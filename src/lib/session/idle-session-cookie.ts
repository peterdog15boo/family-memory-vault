/**
 * Idle activity cookie — mirrors localStorage so middleware can redirect
 * expired continuous sessions before authenticated UI paints.
 *
 * Value: `<sessionId>|<lastActivityAtMs>|<sessionStartedAtMs>|<idleEnabled 0|1>|<warningShownAtMs>`
 * warningShownAtMs is 0 when no warning is showing. Only enforced when sessionId
 * matches the current Clerk session (new logins never inherit a prior session's clock).
 */

import {
  evaluateIdleState,
  isSessionMaxLifetimeExpired,
} from "@/lib/session/idle-timeout";

export const IDLE_ACTIVITY_COOKIE = "fmv_idle";

/** Soft max-age so overnight returns still carry the stamp. */
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 14;

export type IdleActivityCookie = {
  sessionId: string;
  at: number;
  startedAt: number;
  idleEnabled: boolean;
  warningShownAt: number | null;
};

export function serializeIdleActivityCookie(
  sessionId: string,
  at: number,
  startedAt: number,
  idleEnabled = true,
  warningShownAt: number | null = null,
): string {
  const warning = warningShownAt && warningShownAt > 0 ? warningShownAt : 0;
  return `${sessionId}|${at}|${startedAt}|${idleEnabled ? 1 : 0}|${warning}`;
}

export function parseIdleActivityCookie(
  raw: string | null | undefined,
): IdleActivityCookie | null {
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length < 2) return null;
  const sessionId = parts[0];
  const at = Number(parts[1]);
  if (!sessionId || !Number.isFinite(at)) return null;

  // Legacy: sessionId|at
  if (parts.length === 2) {
    return { sessionId, at, startedAt: at, idleEnabled: true, warningShownAt: null };
  }

  const startedAt = Number(parts[2]);
  if (!Number.isFinite(startedAt)) return null;

  // Legacy: sessionId|at|startedAt
  if (parts.length === 3) {
    return { sessionId, at, startedAt, idleEnabled: true, warningShownAt: null };
  }

  const idleEnabled = parts[3] !== "0";
  let warningShownAt: number | null = null;
  if (parts.length >= 5) {
    const warning = Number(parts[4]);
    if (Number.isFinite(warning) && warning > 0) warningShownAt = warning;
  }
  return { sessionId, at, startedAt, idleEnabled, warningShownAt };
}

export function isIdleActivityExpiredForSession(
  cookie: IdleActivityCookie | null | undefined,
  sessionId: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!cookie || !sessionId) return false;
  if (cookie.sessionId !== sessionId) return false;
  if (isSessionMaxLifetimeExpired(cookie.startedAt, now)) return true;
  if (!cookie.idleEnabled) return false;
  return evaluateIdleState(cookie.at, now, cookie.warningShownAt, {
    resume: true,
  }).action === "logout";
}

/** Build Set-Cookie value for the idle activity stamp (browser). */
export function idleActivityCookieWriteValue(
  sessionId: string,
  at: number,
  startedAt: number,
  idleEnabled = true,
  warningShownAt: number | null = null,
): string {
  const value = encodeURIComponent(
    serializeIdleActivityCookie(
      sessionId,
      at,
      startedAt,
      idleEnabled,
      warningShownAt,
    ),
  );
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  return `${IDLE_ACTIVITY_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

export function idleActivityCookieClearValue(): string {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  return `${IDLE_ACTIVITY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function writeIdleActivityCookie(
  sessionId: string,
  at: number,
  startedAt: number,
  idleEnabled = true,
  warningShownAt: number | null = null,
): void {
  try {
    document.cookie = idleActivityCookieWriteValue(
      sessionId,
      at,
      startedAt,
      idleEnabled,
      warningShownAt,
    );
  } catch {
    // private mode / non-browser
  }
}

export function clearIdleActivityCookie(): void {
  try {
    document.cookie = idleActivityCookieClearValue();
  } catch {
    // ignore
  }
}

/** Read idle cookie from a Cookie header or document.cookie string. */
export function readIdleActivityCookieFromHeader(
  cookieHeader: string | null | undefined,
): IdleActivityCookie | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${IDLE_ACTIVITY_COOKIE}=`)) continue;
    const raw = trimmed.slice(IDLE_ACTIVITY_COOKIE.length + 1);
    try {
      return parseIdleActivityCookie(decodeURIComponent(raw));
    } catch {
      return parseIdleActivityCookie(raw);
    }
  }
  return null;
}

/** Exported for tests — cookie must outlive the idle window. */
export const IDLE_ACTIVITY_COOKIE_MAX_AGE_SEC = COOKIE_MAX_AGE_SEC;
