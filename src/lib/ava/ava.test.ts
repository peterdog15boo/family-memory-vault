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
    cleanUsableMediaCount: 0,
    memoryCount: 0,
    peopleCount: 0,
    movieCount: 0,
    inviteCount: 0,
    assistantConversationCount: 0,
    displayName: null,
    imageUrl: null,
    latestMemoryId: null,
    hasActiveWillDraft: false,
    ...partial,
  };
}

/** Identity complete for Ava: username confirmed with Ava + live profile. */
function confirmedNameState(
  partial: Parameters<typeof normalizeOnboardingState>[0] = {},
) {
  const base = partial ?? {};
  return normalizeOnboardingState({
    eligible: true,
    ...base,
    screenName: base.screenName ?? "Jeff",
    welcomeSeenAt: base.welcomeSeenAt ?? new Date().toISOString(),
    helperProgress: {
      screenNameSet: true,
      welcomeSeen: true,
      ...(base.helperProgress ?? {}),
    },
  });
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
    expect(isRealDisplayName("jeff@gmail.com")).toBe(false);
    expect(avaHasRealScreenName(null)).toBe(false);
  });

  it("treats real avatar URLs as complete", () => {
    expect(isRealAvatarUrl("https://img.clerk.com/abc.png")).toBe(true);
    expect(avaHasAvatarSet("https://img.clerk.com/avatar.png")).toBe(true);
  });

  it("rejects missing avatars", () => {
    expect(isRealAvatarUrl(null)).toBe(false);
    expect(isRealAvatarUrl("")).toBe(false);
    expect(avaHasAvatarSet(null)).toBe(false);
  });

  it("skips username when Google/OAuth already provided a real display name", () => {
    const state = normalizeOnboardingState({ eligible: true });
    const signals = emptySignals({
      displayName: "Jeff Roberts",
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

  it("asks for username first when display name is missing or a placeholder", () => {
    const state = normalizeOnboardingState({
      eligible: true,
      helperProgress: { welcomeSeen: true },
      welcomeSeenAt: new Date().toISOString(),
    });
    const missing = avaBuildSteps(
      state,
      emptySignals({
        displayName: null,
        imageUrl: "https://img.clerk.com/avatar.png",
      }),
    );
    expect(missing.find((s) => s.id === "screen_name")?.status).toBe(
      "available",
    );
    expect(missing.find((s) => s.id === "avatar")?.status).toBe("locked");

    const placeholder = avaBuildSteps(
      state,
      emptySignals({
        displayName: "Family member",
        imageUrl: "https://img.clerk.com/avatar.png",
      }),
    );
    expect(placeholder.find((s) => s.id === "screen_name")?.status).toBe(
      "available",
    );

    const emailFallback = avaBuildSteps(
      state,
      emptySignals({
        displayName: "jeff@gmail.com",
        imageUrl: "https://img.clerk.com/avatar.png",
      }),
    );
    expect(emailFallback.find((s) => s.id === "screen_name")?.status).toBe(
      "available",
    );
  });

  it("unlocks later steps after Ava username is confirmed", () => {
    const state = confirmedNameState();
    const signals = emptySignals({
      displayName: "Jeff",
      imageUrl: "https://img.clerk.com/avatar.png",
    });
    expect(avaIdentitySetupComplete(state, signals)).toBe(true);
    const steps = avaBuildSteps(state, signals);
    expect(steps.find((s) => s.id === "screen_name")?.status).toBe("done");
    expect(steps.find((s) => s.id === "welcome")?.status).toBe("done");
    expect(steps.find((s) => s.id === "avatar")?.status).toBe("done");
    expect(steps.find((s) => s.id === "upload")?.status).toBe("available");
  });

  it("adds a Legacy+ upgrade note on documents step when plan lacks access", () => {
    const state = confirmedNameState({
      helperProgress: {
        screenNameSet: true,
        welcomeSeen: true,
        peopleExplained: true,
      },
    });
    const signals = emptySignals({
      displayName: "Jeff",
      imageUrl: "https://img.clerk.com/avatar.png",
      mediaCount: 2,
      cleanPhotoCount: 2,
      cleanUsableMediaCount: 2,
      memoryCount: 1,
      peopleCount: 1,
    });
    const steps = avaBuildSteps(state, signals, undefined, {
      legacyPlus: false,
      betaMode: true,
    });
    const docs = steps.find((s) => s.id === "documents_legacy");
    expect(docs?.status).toBe("available");
    expect(docs?.href).toBe("/billing");
    expect(docs?.upgradeNote).toMatch(/Legacy\+/);
    expect(docs?.ctaLabel).toMatch(/Legacy\+/);
  });

  it("offers will planner once for Legacy+ without a draft", () => {
    const state = confirmedNameState({
      helperProgress: {
        welcomeSeen: true,
        documentsIntroSeen: true,
      },
    });
    const signals = emptySignals({
      displayName: "Jeff",
      imageUrl: "https://img.clerk.com/avatar.png",
      mediaCount: 2,
      cleanPhotoCount: 2,
      cleanUsableMediaCount: 2,
      memoryCount: 1,
      peopleCount: 1,
      hasActiveWillDraft: false,
    });
    const steps = avaBuildSteps(state, signals, undefined, {
      legacyPlus: true,
    });
    const will = steps.find((s) => s.id === "will_planner");
    expect(will?.status).toBe("available");
    expect(will?.href).toBe("/legacy/will");
    expect(will?.ctaLabel).toMatch(/will planner/i);
  });

  it("marks will planner done when a draft already exists", () => {
    const state = confirmedNameState({
      helperProgress: { welcomeSeen: true },
    });
    const steps = avaBuildSteps(
      state,
      emptySignals({
        displayName: "Jeff",
        imageUrl: "https://img.clerk.com/avatar.png",
        mediaCount: 2,
        cleanPhotoCount: 2,
        memoryCount: 1,
        peopleCount: 1,
        hasActiveWillDraft: true,
      }),
      undefined,
      { legacyPlus: true },
    );
    expect(steps.find((s) => s.id === "will_planner")?.status).toBe("done");
  });

  it("locks create_movie until 5 clean/ready library media exist", () => {
    const state = confirmedNameState();
    const base = {
      displayName: "Jeff",
      imageUrl: "https://img.clerk.com/avatar.png",
      mediaCount: 4,
      cleanPhotoCount: 4,
      memoryCount: 1,
    };

    const locked = avaBuildSteps(
      state,
      emptySignals({ ...base, cleanUsableMediaCount: 4 }),
    );
    expect(locked.find((s) => s.id === "create_movie")?.status).toBe("locked");

    const unlocked = avaBuildSteps(
      state,
      emptySignals({
        ...base,
        mediaCount: 5,
        cleanPhotoCount: 5,
        cleanUsableMediaCount: 5,
      }),
    );
    expect(unlocked.find((s) => s.id === "create_movie")?.status).toBe(
      "available",
    );
  });

  it("marks create_movie done after a movie exists without re-prompting", () => {
    const state = confirmedNameState();
    const steps = avaBuildSteps(
      state,
      emptySignals({
        displayName: "Jeff",
        imageUrl: "https://img.clerk.com/avatar.png",
        mediaCount: 2,
        cleanPhotoCount: 2,
        cleanUsableMediaCount: 2,
        memoryCount: 1,
        movieCount: 1,
      }),
    );
    expect(steps.find((s) => s.id === "create_movie")?.status).toBe("done");
  });

  it("deep-links create_movie into the memory movie panel", () => {
    const state = confirmedNameState();
    const steps = avaBuildSteps(
      state,
      emptySignals({
        displayName: "Jeff",
        imageUrl: "https://img.clerk.com/avatar.png",
        mediaCount: 5,
        cleanPhotoCount: 5,
        cleanUsableMediaCount: 5,
        memoryCount: 1,
        latestMemoryId: "mem_abc",
      }),
    );
    expect(steps.find((s) => s.id === "create_movie")?.href).toBe(
      "/memories/mem_abc?createMovie=1",
    );
  });

  it("uses invite-after-movie copy when the first movie is ready", () => {
    const state = confirmedNameState({
      helperProgress: {
        screenNameSet: true,
        welcomeSeen: true,
        inviteAfterFirstMovieReady: true,
      },
    });
    const steps = avaBuildSteps(
      state,
      emptySignals({
        displayName: "Jeff",
        imageUrl: "https://img.clerk.com/avatar.png",
        mediaCount: 5,
        cleanPhotoCount: 5,
        cleanUsableMediaCount: 5,
        memoryCount: 1,
        movieCount: 1,
      }),
    );
    const invite = steps.find((s) => s.id === "invite");
    expect(invite?.status).toBe("available");
    expect(invite?.description).toMatch(/first movie/i);
  });

  it("keeps identity incomplete when avatar is missing after username", () => {
    const state = confirmedNameState();
    const signals = emptySignals({ displayName: "Jeff", imageUrl: null });
    expect(avaIdentitySetupComplete(state, signals)).toBe(false);
    const steps = avaBuildSteps(state, signals);
    expect(steps.find((s) => s.id === "screen_name")?.status).toBe("done");
    expect(steps.find((s) => s.id === "avatar")?.status).toBe("available");
    expect(steps.find((s) => s.id === "upload")?.status).toBe("locked");
  });

  it("skips first-upload prompt when ritual already added photos", () => {
    const state = confirmedNameState({
      firstFamilyMovieCompletedAt: new Date().toISOString(),
      helperProgress: {
        screenNameSet: true,
        welcomeSeen: true,
        photosReadyCelebrated: true,
      },
    });
    const steps = avaBuildSteps(
      state,
      emptySignals({
        displayName: "Jeff",
        imageUrl: "https://img.clerk.com/avatar.png",
        mediaCount: 5,
        cleanPhotoCount: 5,
        cleanUsableMediaCount: 5,
      }),
    );
    expect(steps.find((s) => s.id === "upload")?.status).toBe("done");
    expect(steps.find((s) => s.id === "create_memory")?.status).toBe(
      "available",
    );
  });

  it("skips first-movie prompt when ritual already created a movie", () => {
    const state = confirmedNameState({
      firstFamilyMovieCompletedAt: new Date().toISOString(),
      firstFamilyMovieId: "mov_ritual",
      helperProgress: {
        screenNameSet: true,
        welcomeSeen: true,
        photosReadyCelebrated: true,
        inviteAfterFirstMovieReady: true,
      },
    });
    const steps = avaBuildSteps(
      state,
      emptySignals({
        displayName: "Jeff",
        imageUrl: "https://img.clerk.com/avatar.png",
        mediaCount: 5,
        cleanPhotoCount: 5,
        cleanUsableMediaCount: 5,
        memoryCount: 1,
        movieCount: 0,
      }),
    );
    expect(steps.find((s) => s.id === "create_movie")?.status).toBe("done");
    expect(steps.find((s) => s.id === "invite")?.status).toBe("available");
    expect(steps.find((s) => s.id === "people")?.status).toBe("available");
  });
});
