import { describe, expect, it } from "vitest";
import {
  hasRecentMeaningfulAction,
  isCompletenessStalled,
  isUserDormant,
} from "@/lib/retention/dormancy";
import {
  isRetentionTipEligible,
  pickRetentionTipId,
} from "@/lib/retention/tips";
import type { RetentionVaultSnapshot } from "@/lib/retention/types";
import {
  createRetentionUnsubscribeToken,
  verifyRetentionUnsubscribeToken,
} from "@/lib/retention/unsubscribe";

function snap(
  partial: Partial<RetentionVaultSnapshot> = {},
): RetentionVaultSnapshot {
  return {
    mediaCount: 0,
    cleanUsableMediaCount: 0,
    memoryCount: 0,
    peopleCount: 0,
    namedPeopleCount: 0,
    movieCount: 0,
    hasInvitedFamily: false,
    hasFamilyWithOthers: false,
    hasUsedFamilyChat: false,
    hasUsedAskAi: false,
    hasOpenedOnThisDay: false,
    hasLegacyPlus: false,
    hasFamilyTree: false,
    accountAgeDays: 30,
    lastActiveAt: null,
    lastMeaningfulActionAt: null,
    completenessNextId: null,
    completenessStalledSince: null,
    ...partial,
  };
}

describe("retention dormancy", () => {
  const now = new Date("2026-09-04T12:00:00Z");

  it("is not dormant when a meaningful action happened recently", () => {
    const s = snap({
      lastMeaningfulActionAt: new Date("2026-09-02T12:00:00Z"),
      lastActiveAt: new Date("2026-08-01T12:00:00Z"),
    });
    expect(hasRecentMeaningfulAction(s, now)).toBe(true);
    expect(isUserDormant(s, now)).toBe(false);
  });

  it("is dormant when idle on vault actions for 7+ days", () => {
    const s = snap({
      lastMeaningfulActionAt: new Date("2026-08-20T12:00:00Z"),
      lastActiveAt: new Date("2026-09-03T12:00:00Z"),
    });
    expect(isUserDormant(s, now)).toBe(true);
  });

  it("detects stalled completeness", () => {
    expect(
      isCompletenessStalled(
        {
          completenessNextId: "peopleNamed",
          completenessStalledSince: "2026-08-20T12:00:00Z",
        },
        now,
      ),
    ).toBe(true);
  });
});

describe("retention tip picker", () => {
  it("suggests upload when the vault is empty", () => {
    expect(pickRetentionTipId(snap())).toBe("upload_photo");
  });

  it("gates movie tip on 5+ ready items", () => {
    const low = snap({ cleanUsableMediaCount: 4, mediaCount: 4 });
    expect(isRetentionTipEligible("simple_movie", low)).toBe(false);
    const ok = snap({ cleanUsableMediaCount: 5, mediaCount: 5 });
    expect(isRetentionTipEligible("simple_movie", ok)).toBe(true);
  });

  it("does not claim Free users already have Family Tree", () => {
    const tipId = pickRetentionTipId(
      snap({
        mediaCount: 8,
        cleanUsableMediaCount: 8,
        memoryCount: 1,
        namedPeopleCount: 1,
        movieCount: 1,
        hasInvitedFamily: true,
        hasFamilyTree: false,
        hasLegacyPlus: false,
        hasOpenedOnThisDay: true,
        hasUsedAskAi: true,
      }),
    );
    expect(tipId).toBe("family_tree");
  });

  it("respects snoozes and completed tips", () => {
    const until = new Date(Date.now() + 86400000).toISOString();
    expect(
      pickRetentionTipId(snap(), {
        snoozes: [
          { tipId: "upload_photo", until },
          { tipId: "family_tree", until },
          { tipId: "documents_legacy", until },
        ],
      }),
    ).toBeNull();
    expect(
      pickRetentionTipId(snap({ mediaCount: 1 }), {
        completed: ["upload_photo", "name_people", "invite_family"],
      }),
    ).toBe("family_tree");
  });
});

describe("retention unsubscribe token", () => {
  it("round-trips a signed token", () => {
    process.env.WORKER_SECRET = "test-worker-secret-for-unsub";
    const token = createRetentionUnsubscribeToken("user_123");
    expect(token).toBeTruthy();
    expect(verifyRetentionUnsubscribeToken(token!)).toEqual({
      userId: "user_123",
    });
    expect(verifyRetentionUnsubscribeToken("nope")).toBeNull();
  });
});
