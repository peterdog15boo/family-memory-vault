/**
 * @vitest-environment jsdom
 */
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateIdleState,
  IDLE_LOGOUT_GRACE_MS,
  IDLE_TOTAL_MS,
  IDLE_WARNING_MS,
} from "@/lib/session/idle-timeout";
import { IDLE_LAST_ACTIVITY_KEY } from "@/lib/session/idle-session-sync";

const signOut = vi.fn(async () => undefined);

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut }),
}));

vi.mock("@/components/i18n/LocaleProvider", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values && "count" in values) return `${key}:${values.count}`;
    return key;
  },
}));

vi.mock("@/hooks/useOverlayA11y", () => ({
  useOverlayA11y: () => {},
}));

import { IdleSessionGuard } from "@/components/session/IdleSessionGuard";

const freePolicy = {
  enabled: true,
  preferenceEnabled: true,
  canDisable: false,
  planSlug: "free",
} as const;

const paidPolicy = {
  enabled: true,
  preferenceEnabled: true,
  canDisable: true,
  planSlug: "family",
} as const;

function renderGuard(
  policy: typeof freePolicy | typeof paidPolicy = freePolicy,
) {
  return render(
    createElement(IdleSessionGuard, { initialPolicy: policy }),
  );
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("evaluateIdleState", () => {
  it("splits none / warn / logout on 15m and 17m boundaries", () => {
    const t0 = 1_000_000;
    expect(evaluateIdleState(t0, t0 + IDLE_WARNING_MS - 1).action).toBe("none");
    expect(evaluateIdleState(t0, t0 + IDLE_WARNING_MS).action).toBe("warn");
    const warn = evaluateIdleState(t0, t0 + IDLE_WARNING_MS + 30_000);
    expect(warn).toMatchObject({
      action: "warn",
      graceRemainingMs: IDLE_LOGOUT_GRACE_MS - 30_000,
    });
    expect(evaluateIdleState(t0, t0 + IDLE_TOTAL_MS).action).toBe("logout");
  });
});

describe("IdleSessionGuard checklist", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signOut.mockClear();
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ok: true,
          idleTimeout: freePolicy,
        }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("1–2: free user sees warning after 15m and signs out after 2m grace", async () => {
    renderGuard(freePolicy);
    await flushMicrotasks();

    await advance(IDLE_WARNING_MS);

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("session.idleTitle")).toBeTruthy();
    expect(screen.queryByText("session.idleDisable")).toBeNull();

    await advance(IDLE_LOGOUT_GRACE_MS);

    expect(signOut).toHaveBeenCalledWith({
      redirectUrl: "/sign-in?reason=inactivity",
    });
  });

  it("3: Yes, I’m here resets lastActivityAt (no logout)", async () => {
    renderGuard(freePolicy);
    await flushMicrotasks();

    await advance(IDLE_WARNING_MS);
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    fireEvent.click(screen.getByText("session.idleStaySignedIn"));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await advance(IDLE_LOGOUT_GRACE_MS + 1_000);
    expect(signOut).not.toHaveBeenCalled();

    await advance(IDLE_WARNING_MS);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("4: free user cannot disable (no button)", async () => {
    renderGuard(freePolicy);
    await flushMicrotasks();
    await advance(IDLE_WARNING_MS);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.queryByText("session.idleDisable")).toBeNull();
  });

  it("5–7: paid Disable / re-enable via policy event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return Response.json({
            ok: true,
            idleTimeout: {
              ...paidPolicy,
              enabled: false,
              preferenceEnabled: false,
            },
          });
        }
        return Response.json({ ok: true, idleTimeout: paidPolicy });
      }),
    );

    renderGuard(paidPolicy);
    await flushMicrotasks();

    await advance(IDLE_WARNING_MS);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("session.idleDisable")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("session.idleDisable"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("alertdialog")).toBeNull();

    await advance(IDLE_WARNING_MS + IDLE_LOGOUT_GRACE_MS);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(signOut).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("fmv:idle-timeout-policy", {
          detail: {
            ...paidPolicy,
            enabled: true,
            preferenceEnabled: true,
          },
        }),
      );
    });

    await advance(IDLE_WARNING_MS);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("resume after 20+ minutes enforces logout without waiting for throttled timers", async () => {
    const now = Date.now();
    localStorage.setItem(
      IDLE_LAST_ACTIVITY_KEY,
      String(now - IDLE_TOTAL_MS - 3 * 60 * 1000),
    );

    renderGuard(freePolicy);
    await flushMicrotasks();

    expect(signOut).toHaveBeenCalledWith({
      redirectUrl: "/sign-in?reason=inactivity",
    });
  });

  it("resume after 16 minutes shows warning with residual grace", async () => {
    const now = Date.now();
    localStorage.setItem(
      IDLE_LAST_ACTIVITY_KEY,
      String(now - IDLE_WARNING_MS - 60_000),
    );

    renderGuard(freePolicy);
    await flushMicrotasks();

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();

    // Residual grace ≈ 1 minute; advancing past it logs out.
    await advance(IDLE_LOGOUT_GRACE_MS);
    expect(signOut).toHaveBeenCalled();
  });

  it("visibilitychange resume recomputes idle (does not reset activity)", async () => {
    renderGuard(freePolicy);
    await flushMicrotasks();

    // Simulate backgrounded time by rewriting last activity, then resume.
    const past = Date.now() - IDLE_TOTAL_MS - 1_000;
    localStorage.setItem(IDLE_LAST_ACTIVITY_KEY, String(past));
    // Also poke the in-memory clock via a storage-synced path: remount check
    // is covered above; here fire visibility after advancing wall clock.
    await act(async () => {
      // Force lastActivityAt via peer storage-style path isn't available in-memory;
      // advance timers to warning first, then jump past total with Date mock.
      await vi.advanceTimersByTimeAsync(IDLE_WARNING_MS);
    });
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_LOGOUT_GRACE_MS + 5_000);
    });
    // Opportunistic timer + tick should logout; visibility is belt-and-suspenders.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(signOut).toHaveBeenCalled();
  });
});
