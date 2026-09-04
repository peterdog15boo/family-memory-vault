/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { AvaProgress, AvaStep } from "@/lib/ava/types";
import {
  AVA_LEGACY_PLUS_GATE_STORAGE_KEY,
  featureHrefForLegacyPlusGate,
  isAvaLegacyPlusGateStep,
  isAvaSkipViaApiStep,
  persistDismissedLegacyPlusGate,
  pickDisplayedAvaStep,
  readDismissedLegacyPlusGates,
} from "@/lib/ava/legacy-plus-gate";

function step(partial: Partial<AvaStep> & Pick<AvaStep, "id">): AvaStep {
  return {
    title: partial.id,
    description: "",
    href: "/billing",
    ctaLabel: "Switch to Legacy+ (free in beta)",
    optional: true,
    status: "available",
    upgradeNote: "Will planner is part of Legacy+.",
    ...partial,
  };
}

function progressWith(steps: AvaStep[], activeStepId: AvaStep["id"]): AvaProgress {
  return {
    showPanel: false,
    autoOpenReason: null,
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
    activeStepId,
    steps,
    visibleSteps: steps.filter((s) => s.status !== "locked"),
    completedCount: 0,
    totalCount: steps.length,
    percent: 0,
    signals: {
      mediaCount: 2,
      pendingModerationCount: 0,
      cleanPhotoCount: 2,
      cleanUsableMediaCount: 2,
      memoryCount: 1,
      peopleCount: 1,
      movieCount: 0,
      inviteCount: 0,
      assistantConversationCount: 0,
      displayName: "Jeff",
      imageUrl: "https://img.clerk.com/a.png",
      latestMemoryId: null,
      hasActiveWillDraft: false,
    },
    dormant: false,
    retentionTip: null,
    retentionCanAutoOpen: false,
  };
}

describe("Legacy+ Ava gate helpers", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("identifies Documents and Will planner upgrade cards", () => {
    expect(isAvaLegacyPlusGateStep("will_planner")).toBe(true);
    expect(isAvaLegacyPlusGateStep("documents_legacy")).toBe(true);
    expect(isAvaLegacyPlusGateStep("invite")).toBe(false);
    expect(isAvaSkipViaApiStep("will_planner")).toBe(false);
    expect(featureHrefForLegacyPlusGate("will_planner")).toBe("/legacy/will");
    expect(featureHrefForLegacyPlusGate("documents_legacy")).toBe("/documents");
  });

  it("persists dismiss for this tab session only", () => {
    persistDismissedLegacyPlusGate("will_planner");
    expect(readDismissedLegacyPlusGates().has("will_planner")).toBe(true);
    expect(sessionStorage.getItem(AVA_LEGACY_PLUS_GATE_STORAGE_KEY)).toContain(
      "will_planner",
    );
  });

  it("after dismiss, pickDisplayedAvaStep skips the blocking card", () => {
    const will = step({ id: "will_planner", status: "active" });
    const complete = step({
      id: "complete",
      status: "available",
      optional: false,
      href: "/dashboard",
      upgradeNote: null,
    });
    const progress = progressWith([will, complete], "will_planner");

    expect(pickDisplayedAvaStep(progress)?.id).toBe("will_planner");

    persistDismissedLegacyPlusGate("will_planner");
    expect(pickDisplayedAvaStep(progress)?.id).toBe("complete");
  });

  it("new empty sessionStorage shows the prompt again", () => {
    persistDismissedLegacyPlusGate("will_planner");
    sessionStorage.clear();
    const will = step({ id: "will_planner", status: "active" });
    const progress = progressWith([will], "will_planner");
    expect(pickDisplayedAvaStep(progress)?.id).toBe("will_planner");
  });
});
