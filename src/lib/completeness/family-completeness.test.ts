import { describe, expect, it } from "vitest";
import {
  completenessPercent,
  pickCompletenessNextAction,
  type CompletenessItem,
} from "@/lib/completeness/family-completeness";

function items(
  flags: Partial<Record<CompletenessItem["id"], boolean>>,
): CompletenessItem[] {
  const order: CompletenessItem["id"][] = [
    "mediaUploaded",
    "peopleNamed",
    "firstMovie",
    "familyInvited",
    "legacyStarted",
  ];
  const hrefs: Record<CompletenessItem["id"], string> = {
    mediaUploaded: "/upload",
    peopleNamed: "/people",
    firstMovie: "/memories?createMovie=1",
    familyInvited: "/family",
    legacyStarted: "/billing",
  };
  return order.map((id) => ({
    id,
    done: Boolean(flags[id]),
    href: hrefs[id],
  }));
}

describe("family completeness", () => {
  it("picks the first incomplete step as next action", () => {
    expect(pickCompletenessNextAction(items({}))?.id).toBe("mediaUploaded");
    expect(
      pickCompletenessNextAction(
        items({ mediaUploaded: true, peopleNamed: true }),
      )?.id,
    ).toBe("firstMovie");
  });

  it("returns null when all done", () => {
    expect(
      pickCompletenessNextAction(
        items({
          mediaUploaded: true,
          peopleNamed: true,
          firstMovie: true,
          familyInvited: true,
          legacyStarted: true,
        }),
      ),
    ).toBeNull();
  });

  it("computes percent from done/total", () => {
    expect(completenessPercent(0, 5)).toBe(0);
    expect(completenessPercent(1, 5)).toBe(20);
    expect(completenessPercent(5, 5)).toBe(100);
  });
});
