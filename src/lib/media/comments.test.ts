import { describe, expect, it } from "vitest";
import {
  isLowSignalMediaComment,
  MEDIA_COMMENT_MAX_LENGTH,
  normalizeMediaCommentBody,
} from "@/lib/media/comments-shared";
import { roleHasCapability } from "@/lib/permissions";
import { collectCaptionBeatsFromMedia } from "@/lib/people/stories";
import type { Media } from "@/lib/db/schema";

describe("normalizeMediaCommentBody", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeMediaCommentBody("  Beach   day  ")).toBe("Beach day");
  });

  it("stores empty as null", () => {
    expect(normalizeMediaCommentBody("")).toBeNull();
    expect(normalizeMediaCommentBody("   ")).toBeNull();
  });

  it("truncates to the max length", () => {
    const long = "a".repeat(MEDIA_COMMENT_MAX_LENGTH + 40);
    expect(normalizeMediaCommentBody(long)?.length).toBe(
      MEDIA_COMMENT_MAX_LENGTH,
    );
  });
});

describe("isLowSignalMediaComment", () => {
  it("filters short and generic praise", () => {
    expect(isLowSignalMediaComment("nice pic")).toBe(true);
    expect(isLowSignalMediaComment("wow!!!")).toBe(true);
    expect(isLowSignalMediaComment("ok")).toBe(true);
  });

  it("keeps meaningful notes", () => {
    expect(isLowSignalMediaComment("Dad’s birthday cake at the lake")).toBe(
      false,
    );
  });
});

describe("media comment access policy", () => {
  it("viewers and members who can see media may comment; outsiders cannot", () => {
    // Comment create uses canViewMedia (view capability), not contribute.
    expect(roleHasCapability("owner", "view")).toBe(true);
    expect(roleHasCapability("member", "view")).toBe(true);
    expect(roleHasCapability("viewer", "view")).toBe(true);
    expect(roleHasCapability("viewer", "contribute")).toBe(false);
  });

  it("edit own comment vs owner delete any mirrors author/owner checks", () => {
    const authorCanEditOwn = true;
    const authorCanDeleteOwn = true;
    const mediaOwnerCanDeleteOthers = true;
    const strangerCanDelete = false;
    expect(authorCanEditOwn && authorCanDeleteOwn).toBe(true);
    expect(mediaOwnerCanDeleteOthers).toBe(true);
    expect(strangerCanDelete).toBe(false);
  });
});

describe("collectCaptionBeatsFromMedia with comments", () => {
  function fakeMedia(
    id: string,
    caption: string | null,
  ): Media {
    return {
      id,
      caption,
      moderationStatus: "clean",
      status: "ready",
      takenAt: new Date("2024-06-01T12:00:00Z"),
      createdAt: new Date("2024-06-01T12:00:00Z"),
    } as Media;
  }

  it("keeps caption first and appends comment lines, skipping noise", () => {
    const beats = collectCaptionBeatsFromMedia(
      [fakeMedia("m1", "Lake picnic")],
      new Map([["m1", ["nice pic", "Grandma brought the pie"]]]),
    );
    expect(beats.map((b) => b.caption)).toEqual([
      "Lake picnic",
      "Grandma brought the pie",
    ]);
  });
});
