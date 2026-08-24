import { describe, expect, it } from "vitest";
import {
  alreadySentCampaign,
  hasLifecycleCooldownElapsed,
  pickEligibleCampaign,
  type UserFeatureSnapshot,
} from "@/lib/email/campaigns";
import { resolveAnnouncementCtaUrl } from "@/lib/email/announcements";
import {
  inviteFamilyTipEmail,
  productAnnouncementEmail,
} from "@/lib/email/templates";

const emptySnapshot = (): UserFeatureSnapshot => ({
  mediaCount: 0,
  movieCount: 0,
  peopleCount: 0,
  hasInvitedFamily: false,
  hasFamilyWithOthers: false,
  hasUsedFamilyChat: false,
  hasUsedAskAi: false,
});

describe("lifecycle campaign eligibility", () => {
  it("respects 7-day cooldown", () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    expect(
      hasLifecycleCooldownElapsed({
        lastLifecycleEmailAt: "2026-08-20T12:00:00.000Z",
        now,
      }),
    ).toBe(false);
    expect(
      hasLifecycleCooldownElapsed({
        lastLifecycleEmailAt: "2026-08-15T12:00:00.000Z",
        now,
      }),
    ).toBe(true);
    expect(hasLifecycleCooldownElapsed({ lastLifecycleEmailAt: null, now })).toBe(
      true,
    );
  });

  it("picks invite_family first when eligible", () => {
    const key = pickEligibleCampaign(
      { ...emptySnapshot(), mediaCount: 2 },
      [],
    );
    expect(key).toBe("invite_family");
  });

  it("skips campaigns already sent or features already used", () => {
    expect(
      pickEligibleCampaign(
        {
          ...emptySnapshot(),
          mediaCount: 10,
          movieCount: 0,
          hasInvitedFamily: true,
        },
        ["make_first_movie"],
      ),
    ).toBe("name_people");

    expect(
      pickEligibleCampaign(
        {
          ...emptySnapshot(),
          mediaCount: 10,
          movieCount: 1,
          peopleCount: 2,
          hasInvitedFamily: true,
          hasFamilyWithOthers: true,
          hasUsedFamilyChat: true,
          hasUsedAskAi: false,
        },
        [],
      ),
    ).toBe("try_ask_ai");

    expect(
      alreadySentCampaign(["invite_family"], "invite_family"),
    ).toBe(true);
  });

  it("does not nudge after the feature is used", () => {
    expect(
      pickEligibleCampaign(
        {
          ...emptySnapshot(),
          mediaCount: 10,
          movieCount: 2,
          peopleCount: 1,
          hasInvitedFamily: true,
          hasFamilyWithOthers: true,
          hasUsedFamilyChat: true,
          hasUsedAskAi: true,
        },
        [],
      ),
    ).toBeNull();
  });
});

describe("announcement CTA + templates", () => {
  it("accepts app paths and rejects off-site URLs", () => {
    expect(resolveAnnouncementCtaUrl("/movies")).toContain("/movies");
    expect(resolveAnnouncementCtaUrl("//evil.example")).toBeNull();
    expect(resolveAnnouncementCtaUrl("https://evil.example/x")).toBeNull();
  });

  it("renders invite tip and announcement copy", () => {
    const tip = inviteFamilyTipEmail({
      firstName: "Alex",
      inviteCtaUrl: "https://example.com/family",
    });
    expect(tip.subject).toContain("photos you don’t");
    expect(tip.text).toContain("Hi Alex");
    expect(tip.text).toContain("https://example.com/family");

    const ann = productAnnouncementEmail({
      firstName: "Alex",
      featureName: "Simple Mode",
      featureSummary: "One-click movies from your photos.",
      featureCtaUrl: "https://example.com/movies",
    });
    expect(ann.subject).toBe("What’s new in Family Memory Vault");
    expect(ann.html).toContain("Simple Mode");
    expect(ann.text).toContain("One-click movies");
  });
});
