import { describe, expect, it } from "vitest";
import {
  groupOnThisDayByYear,
  onThisDayMatchesMonthDay,
  type OnThisDayItem,
} from "@/lib/media/on-this-day-shared";

function item(
  partial: Partial<OnThisDayItem> &
    Pick<OnThisDayItem, "id" | "momentYear" | "momentAt">,
): OnThisDayItem {
  return {
    userId: "u1",
    type: "photo",
    contentType: "image/jpeg",
    originalFilename: null,
    createdAt: partial.momentAt,
    previewUrl: null,
    hasThumbnail: false,
    fromCaptureDate: false,
    ...partial,
  };
}

describe("onThisDayMatchesMonthDay", () => {
  it("matches prior-year same month/day only", () => {
    expect(
      onThisDayMatchesMonthDay(
        new Date("2024-08-22T15:00:00.000Z"),
        8,
        22,
        2026,
      ),
    ).toBe(true);
    expect(
      onThisDayMatchesMonthDay(
        new Date("2026-08-22T15:00:00.000Z"),
        8,
        22,
        2026,
      ),
    ).toBe(false);
    expect(
      onThisDayMatchesMonthDay(
        new Date("2024-08-21T15:00:00.000Z"),
        8,
        22,
        2026,
      ),
    ).toBe(false);
  });
});

describe("groupOnThisDayByYear", () => {
  it("groups newest years first and sorts within year", () => {
    const groups = groupOnThisDayByYear([
      item({
        id: "a",
        momentYear: 2020,
        momentAt: "2020-08-22T10:00:00.000Z",
      }),
      item({
        id: "b",
        momentYear: 2024,
        momentAt: "2024-08-22T08:00:00.000Z",
      }),
      item({
        id: "c",
        momentYear: 2024,
        momentAt: "2024-08-22T18:00:00.000Z",
      }),
    ]);
    expect(groups.map((g) => g.year)).toEqual([2024, 2020]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["c", "b"]);
  });
});
