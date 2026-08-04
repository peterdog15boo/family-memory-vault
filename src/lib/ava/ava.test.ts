import { describe, expect, it } from "vitest";
import {
  avaBuildSteps,
  avaHasAvatarSet,
  avaHasRealScreenName,
  avaIdentitySetupComplete,
} from "@/lib/ava";
import { normalizeOnboardingState } from "@/lib/ava/onboarding-state";
import {
  isAvaAvatarPresetUrl,
  validateAvaScreenName,
} from "@/lib/ava/setup";
import { isRealAvatarUrl, isRealDisplayName } from "@/lib/profile";
import type { AvaSignals } from "@/lib/ava/types";

function emptySignals(partial: Partial<AvaSignals> = {}): AvaSignals {
  return {
    mediaCount: 0,
    pendingModerationCount: 0,
    cleanPhotoCount: 0,
    memoryCount: 0,
    peopleCount: 0,
    movieCount: 0,
    inviteCount: 0,
    assistantConversationCount: 0,
    displayName: null,
    imageUrl: null,
    latestMemoryId: null,
    ...partial,
  };
}

describe("validateAvaScreenName", () => {
  it("accepts a simple name", () => {
    expect(validateAvaScreenName("  Jeff  ")).toEqual({
      ok: true,
      value: "Jeff",
    });
  });

  it("rejects too-short or unsafe input", () => {
    expect(validateAvaScreenName("J").ok).toBe(false);
    expect(validateAvaScreenName("https://evil.test").ok).toBe(false);
  });
});

describe("avatar presets", () => {
  it("recognizes preset paths", () => {
    expect(isAvaAvatarPresetUrl("/avatars/preset-sun.svg")).toBe(true);
    expect(isAvaAvatarPresetUrl("https://example.com/x.png")).toBe(false);
  });
});

describe("live profile identity", () => {
  it("treats real display names as complete", () => {
    expect(isRealDisplayName("Jeff")).toBe(true);
    expect(avaHasRealScreenName("Jeff Roberts")).toBe(true);
  });

  it("rejects empty and placeholder names", () => {
    expect(isRealDisplayName(null)).toBe(false);
    expect(isRealDisplayName("")).toBe(false);
    expect(isRealDisplayName("Family member")).toBe(false);
    expect(avaHasRealScreenName(null)).toBe(false);
  });

  it("treats real avatar URLs as complete", () => {
    expect(isRealAvatarUrl("https://img.clerk.com/abc.png")).toBe(true);
    expect(avaHasAvatarSet("https://img.clerk.com/abc.png")).toBe(true);
  });

  it("rejects missing avatars", () => {
    expect(isRealAvatarUrl(null)).toBe(false);
    expect(isRealAvatarUrl("")).toBe(false);
    expect(avaHasAvatarSet(null)).toBe(false);
  });

  it("skips identity when live name + avatar exist", () => {
    const state = normalizeOnboardingState({ eligible: true });
    const signals = emptySignals({
      displayName: "Jeff",
      imageUrl: "https://img.clerk.com/avatar.png",
    });
    expect(avaIdentitySetupComplete(state, signals)).toBe(true);
    const steps = avaBuildSteps(
      {
        ...state,
        helperProgress: { ...state.helperProgress, welcomeSeen: true },
        welcomeSeenAt: new Date().toISOString(),
      },
      signals,
    );
    expect(steps.find((s) => s.id === "screen_name")?.status).toBe("done");
    expect(steps.find((s) => s.id === "avatar")?.status).toBe("done");
    expect(steps.find((s) => s.id === "upload")?.status).toBe("available");
  });

  it("keeps identity incomplete when avatar is missing", () => {
    const state = normalizeOnboardingState({
      eligible: true,
      helperProgress: { welcomeSeen: true },
      welcomeSeenAt: new Date().toISOString(),
    });
    const signals = emptySignals({ displayName: "Jeff", imageUrl: null });
    expect(avaIdentitySetupComplete(state, signals)).toBe(false);
    const steps = avaBuildSteps(state, signals);
    expect(steps.find((s) => s.id === "screen_name")?.status).toBe("done");
    expect(steps.find((s) => s.id === "avatar")?.status).toBe("available");
    expect(steps.find((s) => s.id === "upload")?.status).toBe("locked");
  });

  it("keeps identity incomplete when name is missing", () => {
    const state = normalizeOnboardingState({
      eligible: true,
      helperProgress: { welcomeSeen: true },
      welcomeSeenAt: new Date().toISOString(),
    });
    const signals = emptySignals({
      displayName: null,
      imageUrl: "https://img.clerk.com/avatar.png",
    });
    expect(avaIdentitySetupComplete(state, signals)).toBe(false);
    const steps = avaBuildSteps(state, signals);
    expect(steps.find((s) => s.id === "screen_name")?.status).toBe("available");
    expect(steps.find((s) => s.id === "avatar")?.status).toBe("locked");
  });
});
