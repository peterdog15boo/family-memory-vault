/**
 * @vitest-environment jsdom
 */
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDLE_AUTH_SESSION_KEY,
  IDLE_LAST_ACTIVITY_KEY,
  IDLE_SESSION_STARTED_KEY,
  IDLE_WARNING_SHOWN_KEY,
} from "@/lib/session/idle-session-sync";

const auth = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: false as boolean,
  sessionId: null as string | null,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: auth.isLoaded,
    isSignedIn: auth.isSignedIn,
    sessionId: auth.sessionId,
  }),
}));

import { IdleAuthClockListener } from "@/components/session/IdleAuthClockListener";

describe("IdleAuthClockListener", () => {
  beforeEach(() => {
    localStorage.clear();
    auth.isLoaded = true;
    auth.isSignedIn = false;
    auth.sessionId = null;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("clears lastActivityAt on sign-out", () => {
    localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, "1");
    localStorage.setItem(IDLE_WARNING_SHOWN_KEY, "2");
    localStorage.setItem(IDLE_AUTH_SESSION_KEY, "sess_old");
    auth.isSignedIn = false;
    render(createElement(IdleAuthClockListener));
    expect(localStorage.getItem(IDLE_LAST_ACTIVITY_KEY)).toBeNull();
    expect(localStorage.getItem(IDLE_WARNING_SHOWN_KEY)).toBeNull();
  });

  it("Clerk sign-in rising edge resets lastActivity to now (no leftover stamp)", () => {
    const yesterday = Date.now() - 16 * 60 * 1000;
    auth.isSignedIn = false;
    const { rerender } = render(createElement(IdleAuthClockListener));
    expect(localStorage.getItem(IDLE_LAST_ACTIVITY_KEY)).toBeNull();

    localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, String(yesterday));
    localStorage.setItem(IDLE_SESSION_STARTED_KEY, String(yesterday));
    localStorage.setItem(IDLE_WARNING_SHOWN_KEY, String(yesterday));

    auth.isSignedIn = true;
    auth.sessionId = "sess_new";
    rerender(createElement(IdleAuthClockListener));

    const stored = Number(localStorage.getItem(IDLE_LAST_ACTIVITY_KEY));
    expect(stored).toBeGreaterThan(Date.now() - 5_000);
    expect(localStorage.getItem(IDLE_AUTH_SESSION_KEY)).toBe("sess_new");
    expect(localStorage.getItem(IDLE_WARNING_SHOWN_KEY)).toBeNull();
  });

  it("already-signed-in first paint keeps overnight lastActivity (does not reset)", () => {
    const yesterday = Date.now() - 16 * 60 * 1000;
    localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, String(yesterday));
    localStorage.setItem(IDLE_SESSION_STARTED_KEY, String(yesterday));
    localStorage.setItem(IDLE_AUTH_SESSION_KEY, "sess_same");
    auth.isSignedIn = true;
    auth.sessionId = "sess_same";

    render(createElement(IdleAuthClockListener));

    expect(Number(localStorage.getItem(IDLE_LAST_ACTIVITY_KEY))).toBe(
      yesterday,
    );
  });
});
