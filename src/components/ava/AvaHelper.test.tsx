/**
 * @vitest-environment jsdom
 */
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvaProgress, AvaStep } from "@/lib/ava/types";
import { AVA_LEGACY_PLUS_GATE_STORAGE_KEY } from "@/lib/ava/legacy-plus-gate";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { reload: vi.fn() } }),
}));

vi.mock("@/components/assistant/AskAiContext", () => ({
  useAskAiOptional: () => null,
}));

vi.mock("@/hooks/useOverlayA11y", () => ({
  useOverlayA11y: () => {},
}));

vi.mock("@/lib/billing/beta-flags", () => ({
  isBetaPlanPickerEnabled: () => true,
}));

vi.mock("@/components/i18n/LocaleProvider", () => ({
  useLocale: () => ({ locale: "en-US" }),
  useTranslations: () => (key: string) => key,
}));

import { AvaHelper } from "@/components/ava/AvaHelper";

function willStep(): AvaStep {
  return {
    id: "will_planner",
    title: "Will planner",
    description: "Will planner is part of Legacy+. You can switch plans free during beta.",
    href: "/billing",
    ctaLabel: "Switch to Legacy+ (free in beta)",
    optional: true,
    status: "active",
    upgradeNote: "Will planner needs Legacy+.",
  };
}

function willPlannerProgress(
  overrides: Partial<AvaProgress> = {},
): AvaProgress {
  const will = willStep();
  return {
    showPanel: true,
    autoOpenReason: "invite_after_movie",
    pollWhileWaiting: false,
    showResumeChip: false,
    showHeaderIcon: true,
    hasRecommendedAction: true,
    identityIncomplete: false,
    eligible: true,
    helperEnabled: true,
    dismissed: false,
    completed: false,
    screenName: "Jeff",
    avatarMediaId: null,
    avatarUrl: null,
    avatarPreviewUrl: null,
    activeStepId: "will_planner",
    steps: [will],
    visibleSteps: [will],
    completedCount: 8,
    totalCount: 9,
    percent: 80,
    signals: {
      mediaCount: 6,
      pendingModerationCount: 0,
      cleanPhotoCount: 6,
      cleanUsableMediaCount: 6,
      memoryCount: 1,
      peopleCount: 1,
      movieCount: 1,
      inviteCount: 1,
      assistantConversationCount: 1,
      displayName: "Jeff",
      imageUrl: "https://img.clerk.com/a.png",
      latestMemoryId: null,
      hasActiveWillDraft: false,
    },
    ...overrides,
  };
}

describe("Ava Legacy+ will planner card", () => {
  beforeEach(() => {
    sessionStorage.clear();
    push.mockClear();
    refresh.mockClear();
    const slot = document.createElement("div");
    slot.id = "ava-header-slot";
    document.body.appendChild(slot);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/billing/beta-assign")) {
          return Response.json({
            ok: true,
            planSlug: "legacy",
            planName: "Legacy+",
          });
        }
        if (url.includes("/api/ava") && init?.method === "POST") {
          return Response.json(
            { error: "Invalid request" },
            { status: 400 },
          );
        }
        return Response.json({ progress: willPlannerProgress() });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    document.getElementById("ava-header-slot")?.remove();
  });

  it("Maybe later closes Ava and does not reopen or call skip_step", async () => {
    render(createElement(AvaHelper, { initialProgress: willPlannerProgress() }));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("ava.optional")).toBeNull();

    fireEvent.click(screen.getByText("ava.maybeLater"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.queryByText("Invalid request")).toBeNull();
    expect(sessionStorage.getItem(AVA_LEGACY_PLUS_GATE_STORAGE_KEY)).toContain(
      "will_planner",
    );

    const posts = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => String(call[0]).includes("/api/ava") && call[1]?.method === "POST",
    );
    expect(posts).toHaveLength(0);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("X closes the helper without Invalid request", async () => {
    render(createElement(AvaHelper, { initialProgress: willPlannerProgress() }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("ava.closeForNow"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(screen.queryByText("Invalid request")).toBeNull();
    expect(sessionStorage.getItem(AVA_LEGACY_PLUS_GATE_STORAGE_KEY)).toContain(
      "will_planner",
    );
  });

  it("Switch to Legacy+ in beta hits billing and routes to will planner", async () => {
    render(createElement(AvaHelper, { initialProgress: willPlannerProgress() }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByText("Switch to Legacy+ (free in beta)"));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/legacy/will");
    });

    const billing = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => String(call[0]).includes("/api/billing/beta-assign"),
    );
    expect(billing).toBeTruthy();
    expect(JSON.parse(String(billing?.[1]?.body))).toEqual({
      planSlug: "legacy",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Switch failure shows an error on that action, not Maybe later", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/billing/beta-assign")) {
          return Response.json({ error: "Could not update plan." }, { status: 500 });
        }
        if (url.includes("/api/ava") && init?.method === "POST") {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
        return Response.json({ progress: willPlannerProgress() });
      }),
    );

    render(createElement(AvaHelper, { initialProgress: willPlannerProgress() }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByText("Switch to Legacy+ (free in beta)"));

    expect(await screen.findByText("Could not update plan.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Invalid request")).toBeNull();

    fireEvent.click(screen.getByText("ava.maybeLater"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("header open after dismiss does not force the upgrade card", async () => {
    render(createElement(AvaHelper, { initialProgress: willPlannerProgress() }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByText("ava.maybeLater"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    fireEvent.click(screen.getByLabelText("ava.openWithTip"));

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Switch to Legacy+ (free in beta)")).toBeNull();
    expect(screen.queryByText("ava.optional")).toBeNull();
  });
});
