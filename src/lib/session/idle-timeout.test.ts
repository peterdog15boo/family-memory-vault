import { describe, expect, it, beforeEach } from "vitest";
import {
  IDLE_ACTIVITY_HEARTBEAT_MS,
  IDLE_CRITICAL_FORCE_MS,
  IDLE_LOGOUT_GRACE_MS,
  IDLE_MEDIA_INTERACTION_EVENTS,
  IDLE_TOTAL_MS,
  IDLE_WARNING_MS,
  SESSION_MAX_LIFETIME_MS,
  evaluateIdleState,
  evaluateSessionExpiry,
} from "@/lib/session/idle-timeout";
import {
  __resetCriticalWorkForTests,
  beginCriticalWork,
  getActiveCriticalWorkCount,
  getCriticalWorkSnapshot,
  subscribeCriticalWork,
} from "@/lib/session/critical-activity";
import {
  __resetUploadActivityForTests,
  beginUploadActivity,
  getActiveUploadCount,
  subscribeUploadActivity,
} from "@/lib/session/upload-activity";
import {
  bootstrapIdleActivityForAuthSession,
  clearIdleAuthSessionId,
  clearLastActivityAt,
  consumeInactivityLogoutFlag,
  IDLE_AUTH_SESSION_KEY,
  IDLE_LAST_ACTIVITY_KEY,
  IDLE_SESSION_STARTED_KEY,
  IDLE_TIMEOUT_ENABLED_KEY,
  inactivitySignInPath,
  markInactivityLogout,
  readIdleAuthSessionId,
  readLastActivityAt,
  resetIdleActivityClock,
  shouldSilentExpireIdleSession,
  writeIdleAuthSessionId,
  writeIdleTimeoutEnabledPreference,
  writeLastActivityAt,
  writeSessionStartedAt,
} from "@/lib/session/idle-session-sync";
import {
  IDLE_ACTIVITY_COOKIE,
  isIdleActivityExpiredForSession,
  parseIdleActivityCookie,
  readIdleActivityCookieFromHeader,
  serializeIdleActivityCookie,
} from "@/lib/session/idle-session-cookie";

describe("idle timeout constants", () => {
  it("uses ~2h idle with 10m grace and 12h max lifetime", () => {
    expect(IDLE_TOTAL_MS).toBe(2 * 60 * 60 * 1000);
    expect(IDLE_LOGOUT_GRACE_MS).toBe(10 * 60 * 1000);
    expect(IDLE_WARNING_MS).toBe(IDLE_TOTAL_MS - IDLE_LOGOUT_GRACE_MS);
    expect(SESSION_MAX_LIFETIME_MS).toBe(12 * 60 * 60 * 1000);
    expect(IDLE_ACTIVITY_HEARTBEAT_MS).toBe(60 * 1000);
    expect(IDLE_CRITICAL_FORCE_MS).toBe(2 * 60 * 1000);
  });

  it("evaluateIdleState uses timestamps for warn/logout windows", () => {
    const t0 = 5_000_000;
    expect(evaluateIdleState(t0, t0 + IDLE_WARNING_MS - 1).action).toBe("none");
    expect(evaluateIdleState(t0, t0 + IDLE_WARNING_MS).action).toBe("warn");
    expect(evaluateIdleState(t0, t0 + IDLE_TOTAL_MS).action).toBe("logout");
  });

  it("evaluateSessionExpiry enforces max lifetime even with fresh activity", () => {
    const started = 1_000_000;
    const now = started + SESSION_MAX_LIFETIME_MS;
    const decision = evaluateSessionExpiry({
      lastActivityAt: now - 1_000,
      sessionStartedAt: started,
      now,
      checkIdle: true,
    });
    expect(decision).toMatchObject({
      action: "logout",
      reason: "max_lifetime",
    });
  });

  it("evaluateSessionExpiry can skip idle when checkIdle is false", () => {
    const started = 1_000_000;
    const now = started + IDLE_TOTAL_MS + 1_000;
    expect(
      evaluateSessionExpiry({
        lastActivityAt: started,
        sessionStartedAt: started,
        now,
        checkIdle: false,
      }).action,
    ).toBe("none");
  });

  it("counts media interaction events without unattended playback ticks", () => {
    expect(IDLE_MEDIA_INTERACTION_EVENTS).toContain("play");
    expect(IDLE_MEDIA_INTERACTION_EVENTS).toContain("pause");
    expect(IDLE_MEDIA_INTERACTION_EVENTS).toContain("seeked");
    expect(IDLE_MEDIA_INTERACTION_EVENTS).not.toContain("timeupdate");
    expect(IDLE_MEDIA_INTERACTION_EVENTS).not.toContain("playing");
  });
});

describe("upload activity registry", () => {
  beforeEach(() => {
    __resetUploadActivityForTests();
  });

  it("tracks nested begin/end pairs", () => {
    const endA = beginUploadActivity();
    const endB = beginUploadActivity();
    expect(getActiveUploadCount()).toBe(2);
    endB();
    expect(getActiveUploadCount()).toBe(1);
    endA();
    expect(getActiveUploadCount()).toBe(0);
  });

  it("notifies subscribers", () => {
    const seen: number[] = [];
    const unsub = subscribeUploadActivity((n) => seen.push(n));
    const end = beginUploadActivity();
    expect(seen.at(-1)).toBe(1);
    end();
    expect(seen.at(-1)).toBe(0);
    unsub();
  });
});

describe("critical work registry", () => {
  beforeEach(() => {
    __resetCriticalWorkForTests();
  });

  it("aggregates uploads and movie renders", () => {
    const endUpload = beginCriticalWork("upload");
    const endMovie = beginCriticalWork("movie_render");
    expect(getActiveCriticalWorkCount()).toBe(2);
    expect(getCriticalWorkSnapshot()).toEqual({
      uploads: 1,
      movieRenders: 1,
      total: 2,
    });
    endUpload();
    endMovie();
    expect(getActiveCriticalWorkCount()).toBe(0);
  });

  it("notifies subscribers", () => {
    const seen: number[] = [];
    const unsub = subscribeCriticalWork((s) => seen.push(s.total));
    const end = beginCriticalWork("upload");
    expect(seen.at(-1)).toBe(1);
    end();
    expect(seen.at(-1)).toBe(0);
    unsub();
  });
});

describe("inactivity sign-in helpers", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
      },
    });
  });

  it("mark/consume round-trip", () => {
    expect(consumeInactivityLogoutFlag()).toBe(false);
    markInactivityLogout();
    expect(consumeInactivityLogoutFlag()).toBe(true);
    expect(consumeInactivityLogoutFlag()).toBe(false);
  });

  it("inactivitySignInPath includes reason", () => {
    expect(inactivitySignInPath()).toBe("/sign-in?reason=inactivity");
  });
});

describe("bootstrapIdleActivityForAuthSession", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
      },
    });
  });

  it("resets the clock for a new Clerk session even if prior activity expired", () => {
    const now = 10_000_000;
    writeIdleAuthSessionId("sess_old");
    writeSessionStartedAt(now - IDLE_TOTAL_MS - 60_000);
    writeLastActivityAt(now - IDLE_TOTAL_MS - 60_000);

    const next = bootstrapIdleActivityForAuthSession("sess_new", now);
    expect(next).toBe(now);
    expect(readLastActivityAt()).toBe(now);
    expect(readIdleAuthSessionId()).toBe("sess_new");
  });

  it("keeps stored activity for the same continuous session", () => {
    const now = 10_000_000;
    const past = now - 60_000;
    writeIdleAuthSessionId("sess_same");
    writeSessionStartedAt(past);
    writeLastActivityAt(past);

    expect(bootstrapIdleActivityForAuthSession("sess_same", now)).toBe(past);
    expect(readLastActivityAt()).toBe(past);
  });

  it("discards residual warn/logout state when sessionId is not yet known", () => {
    const now = 10_000_000;
    writeSessionStartedAt(now - IDLE_TOTAL_MS - 1_000);
    writeLastActivityAt(now - IDLE_TOTAL_MS - 1_000);

    expect(bootstrapIdleActivityForAuthSession(null, now)).toBe(now);
    expect(readLastActivityAt()).toBe(now);
  });

  it("resetIdleActivityClock writes a fresh timestamp", () => {
    writeLastActivityAt(1);
    expect(resetIdleActivityClock(99)).toBe(99);
    expect(readLastActivityAt()).toBe(99);
  });

  it("clear helpers remove activity and auth binding", () => {
    writeLastActivityAt(1);
    writeIdleAuthSessionId("sess");
    clearLastActivityAt();
    clearIdleAuthSessionId();
    expect(store.has(IDLE_LAST_ACTIVITY_KEY)).toBe(false);
    expect(store.has(IDLE_AUTH_SESSION_KEY)).toBe(false);
    expect(store.has(IDLE_SESSION_STARTED_KEY)).toBe(false);
  });
});

describe("shouldSilentExpireIdleSession", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
      },
    });
  });

  it("is true only for the continuous session past logout", () => {
    const now = 10_000_000;
    writeIdleAuthSessionId("sess_same");
    writeSessionStartedAt(now - 60_000);
    writeLastActivityAt(now - IDLE_TOTAL_MS - 1_000);
    expect(shouldSilentExpireIdleSession("sess_same", now)).toBe(true);
    expect(shouldSilentExpireIdleSession("sess_new", now)).toBe(false);
    expect(shouldSilentExpireIdleSession(null, now)).toBe(false);
  });

  it("expires on max lifetime even with recent activity", () => {
    const now = 10_000_000;
    writeIdleAuthSessionId("sess_same");
    writeSessionStartedAt(now - SESSION_MAX_LIFETIME_MS - 1);
    writeLastActivityAt(now - 1_000);
    expect(shouldSilentExpireIdleSession("sess_same", now)).toBe(true);
  });

  it("respects paid idle-timeout disabled preference for idle only", () => {
    const now = 10_000_000;
    writeIdleAuthSessionId("sess_same");
    writeSessionStartedAt(now - 60_000);
    writeLastActivityAt(now - IDLE_TOTAL_MS - 1_000);
    writeIdleTimeoutEnabledPreference(false);
    expect(store.get(IDLE_TIMEOUT_ENABLED_KEY)).toBe("0");
    expect(shouldSilentExpireIdleSession("sess_same", now)).toBe(false);
    expect(
      shouldSilentExpireIdleSession("sess_same", now, { checkIdle: false }),
    ).toBe(false);
  });
});

describe("idle activity cookie", () => {
  it("parses and matches session expiry for middleware", () => {
    const now = 10_000_000;
    const started = now - 60_000;
    const raw = serializeIdleActivityCookie(
      "sess_a",
      now - IDLE_TOTAL_MS - 5,
      started,
      true,
    );
    const parsed = parseIdleActivityCookie(raw);
    expect(parsed).toEqual({
      sessionId: "sess_a",
      at: now - IDLE_TOTAL_MS - 5,
      startedAt: started,
      idleEnabled: true,
    });
    expect(isIdleActivityExpiredForSession(parsed, "sess_a", now)).toBe(true);
    expect(isIdleActivityExpiredForSession(parsed, "sess_b", now)).toBe(false);
  });

  it("enforces max lifetime from cookie even when idle is fresh", () => {
    const now = 10_000_000;
    const raw = serializeIdleActivityCookie(
      "sess_a",
      now - 1_000,
      now - SESSION_MAX_LIFETIME_MS - 1,
      true,
    );
    expect(
      isIdleActivityExpiredForSession(parseIdleActivityCookie(raw), "sess_a", now),
    ).toBe(true);
  });

  it("reads from Cookie header", () => {
    const raw = serializeIdleActivityCookie("sess_a", 123, 100, true);
    const header = `other=1; ${IDLE_ACTIVITY_COOKIE}=${encodeURIComponent(raw)}; x=y`;
    expect(readIdleActivityCookieFromHeader(header)).toEqual({
      sessionId: "sess_a",
      at: 123,
      startedAt: 100,
      idleEnabled: true,
    });
  });
});
