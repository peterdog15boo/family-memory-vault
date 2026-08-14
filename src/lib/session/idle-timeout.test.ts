import { describe, expect, it, beforeEach } from "vitest";
import {
  IDLE_CRITICAL_FORCE_MS,
  IDLE_LOGOUT_GRACE_MS,
  IDLE_MEDIA_INTERACTION_EVENTS,
  IDLE_TOTAL_MS,
  IDLE_WARNING_MS,
  evaluateIdleState,
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
  consumeInactivityLogoutFlag,
  inactivitySignInPath,
  markInactivityLogout,
} from "@/lib/session/idle-session-sync";

describe("idle timeout constants", () => {
  it("uses 15 minute warning, 2 minute grace, and critical force window", () => {
    expect(IDLE_WARNING_MS).toBe(15 * 60 * 1000);
    expect(IDLE_LOGOUT_GRACE_MS).toBe(2 * 60 * 1000);
    expect(IDLE_TOTAL_MS).toBe(IDLE_WARNING_MS + IDLE_LOGOUT_GRACE_MS);
    expect(IDLE_CRITICAL_FORCE_MS).toBe(2 * 60 * 1000);
  });

  it("evaluateIdleState uses timestamps for warn/logout windows", () => {
    const t0 = 5_000_000;
    expect(evaluateIdleState(t0, t0 + 14 * 60 * 1000).action).toBe("none");
    expect(evaluateIdleState(t0, t0 + 15 * 60 * 1000).action).toBe("warn");
    expect(evaluateIdleState(t0, t0 + 17 * 60 * 1000).action).toBe("logout");
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
    endA();
    expect(getActiveUploadCount()).toBe(1);
    endB();
    expect(getActiveUploadCount()).toBe(0);
  });

  it("notifies subscribers and ignores double-end", () => {
    const counts: number[] = [];
    const unsub = subscribeUploadActivity((n) => counts.push(n));
    const end = beginUploadActivity();
    end();
    end();
    unsub();
    expect(getActiveUploadCount()).toBe(0);
    expect(counts).toEqual([0, 1, 0]);
  });
});

describe("critical work registry", () => {
  beforeEach(() => {
    __resetCriticalWorkForTests();
  });

  it("tracks uploads and movie renders separately", () => {
    const endUpload = beginCriticalWork("upload");
    const endMovie = beginCriticalWork("movie_render");
    expect(getCriticalWorkSnapshot()).toEqual({
      uploads: 1,
      movieRenders: 1,
      total: 2,
    });
    endUpload();
    expect(getActiveCriticalWorkCount()).toBe(1);
    endMovie();
    expect(getActiveCriticalWorkCount()).toBe(0);
  });

  it("notifies subscribers on change", () => {
    const totals: number[] = [];
    const unsub = subscribeCriticalWork((s) => totals.push(s.total));
    const end = beginCriticalWork("movie_render");
    end();
    unsub();
    expect(totals).toEqual([0, 1, 0]);
  });
});

describe("inactivity sign-in flag", () => {
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

  it("builds the sign-in path with reason", () => {
    expect(inactivitySignInPath()).toBe("/sign-in?reason=inactivity");
  });

  it("marks and consumes the one-shot flag", () => {
    expect(consumeInactivityLogoutFlag()).toBe(false);
    markInactivityLogout();
    expect(consumeInactivityLogoutFlag()).toBe(true);
    expect(consumeInactivityLogoutFlag()).toBe(false);
  });
});
