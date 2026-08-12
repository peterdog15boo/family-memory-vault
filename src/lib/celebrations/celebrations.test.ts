import { describe, expect, it } from "vitest";
import { mapJourneyCelebration } from "@/lib/celebrations/map-journey";
import {
  inAppPresentationForKeys,
  isMajorOutreachMilestone,
  pickOutreachMilestone,
} from "@/lib/celebrations/milestones";
import type { JourneyCelebrationPayload } from "@/lib/gamification/types";

describe("celebration milestones", () => {
  it("keeps full in-app moments rare", () => {
    expect(inAppPresentationForKeys(["photos.5"])).toBe("micro");
    expect(inAppPresentationForKeys(["photos.1"])).toBe("full");
    expect(inAppPresentationForKeys(["legacy.50"])).toBe("full");
    expect(isMajorOutreachMilestone("photos.1")).toBe(true);
    expect(isMajorOutreachMilestone("photos.10")).toBe(false);
    expect(
      pickOutreachMilestone([
        { key: "photos.5", title: "skip" },
        { key: "photos.50", title: "Fifty" },
      ])?.title,
    ).toBe("Fifty");
  });
});

describe("mapJourneyCelebration", () => {
  const base: JourneyCelebrationPayload = {
    kind: "achievement",
    achievements: [
      {
        id: "ach_photos_1",
        key: "photos.1",
        title: "First Snapshot Badge",
        description: "You added your first family photo.",
        category: "photos",
        threshold: 1,
        lpReward: 10,
        badgeImage: null,
        unlockFeature: null,
        unlockedAt: new Date().toISOString(),
      },
    ],
    previousLevel: 1,
    newLevel: 1,
    lpGained: 12,
    track: "photos",
    current: 1,
    nextGoal: null,
  };

  it("turns a major unlock into a full calm celebration", () => {
    const event = mapJourneyCelebration(base, "n1");
    expect(event.presentation).toBe("full");
    expect(event.effects.confetti).toBe(true);
    expect(event.effects.badgeReveal).toBe(true);
    expect(event.effects.lpCount).toBe(true);
    expect(event.fingerprint).toBe("ach_photos_1");
  });

  it("keeps small progress as a toast", () => {
    const event = mapJourneyCelebration(
      {
        ...base,
        presentation: "micro",
        achievements: [
          { ...base.achievements[0]!, id: "ach_photos_5", key: "photos.5" },
        ],
      },
      "n2",
    );
    expect(event.presentation).toBe("micro");
    expect(event.effects.confetti).toBe(false);
    expect(event.effects.sound).toBe(false);
  });
});
