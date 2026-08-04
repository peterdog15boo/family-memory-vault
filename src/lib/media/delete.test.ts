import { describe, expect, it } from "vitest";
import { collectDeletableMediaKeys } from "@/lib/media/delete";

describe("collectDeletableMediaKeys", () => {
  it("returns unique non-quarantine keys", () => {
    expect(
      collectDeletableMediaKeys({
        originalKey: "originals/u1/m1/photo.jpg",
        processedKey: "processed/u1/m1/photo.jpg",
        thumbnailKey: "thumbnails/u1/m1.jpg",
      }),
    ).toEqual([
      "originals/u1/m1/photo.jpg",
      "processed/u1/m1/photo.jpg",
      "thumbnails/u1/m1.jpg",
    ]);
  });

  it("skips quarantine keys and empty values", () => {
    expect(
      collectDeletableMediaKeys({
        originalKey: "quarantine/originals/u1/m1/photo.jpg",
        processedKey: null,
        thumbnailKey: "   ",
      }),
    ).toEqual([]);
  });

  it("dedupes identical keys", () => {
    expect(
      collectDeletableMediaKeys({
        originalKey: "originals/u1/m1/photo.jpg",
        processedKey: "originals/u1/m1/photo.jpg",
        thumbnailKey: "originals/u1/m1/photo.jpg",
      }),
    ).toEqual(["originals/u1/m1/photo.jpg"]);
  });
});
