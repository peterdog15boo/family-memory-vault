import { describe, expect, it } from "vitest";
import {
  detectMediaPreference,
  formatMediaTypeCounts,
} from "@/lib/ai/media-preference";
import { parseIntent } from "@/lib/ai/intent";

describe("detectMediaPreference", () => {
  it("returns photos when the user only asks for photos/pictures/images", () => {
    expect(detectMediaPreference("show me photos of Jeff")).toBe("photos");
    expect(detectMediaPreference("pictures of the beach")).toBe("photos");
    expect(detectMediaPreference("show me images with suits")).toBe("photos");
  });

  it("returns videos when the user only asks for videos/clips", () => {
    expect(detectMediaPreference("show me videos of Jeff")).toBe("videos");
    expect(detectMediaPreference("show me beach videos")).toBe("videos");
    expect(detectMediaPreference("clips of Grandpa")).toBe("videos");
  });

  it("returns both for photos and videos or unspecified type", () => {
    expect(detectMediaPreference("show me photos and videos of Jeff")).toBe(
      "both",
    );
    expect(detectMediaPreference("show me Jeff")).toBe("both");
    expect(detectMediaPreference("show me suits")).toBe("both");
  });

  it("does not treat create-movie as a video-only library preference", () => {
    expect(detectMediaPreference("create a movie of Jeff")).toBe("both");
  });
});

describe("formatMediaTypeCounts", () => {
  it("labels photos, videos, and mixed sets", () => {
    expect(formatMediaTypeCounts([{ type: "photo" }, { type: "photo" }])).toBe(
      "2 photos",
    );
    expect(formatMediaTypeCounts([{ type: "video" }])).toBe("1 video");
    expect(
      formatMediaTypeCounts([
        { type: "photo" },
        { type: "video" },
        { type: "photo" },
      ]),
    ).toBe("2 photos · 1 video");
  });
});

describe("parseIntent media_preference", () => {
  it("sets media_preference from the prompt via finalize", async () => {
    expect(
      (
        await parseIntent("show me videos of Jeff", {
          preferFallback: true,
          knownPeople: ["Jeff"],
        })
      ).media_preference,
    ).toBe("videos");
    expect(
      (
        await parseIntent("show me photos of Jeff", {
          preferFallback: true,
          knownPeople: ["Jeff"],
        })
      ).media_preference,
    ).toBe("photos");
    expect(
      (
        await parseIntent("show me Jeff", {
          preferFallback: true,
          knownPeople: ["Jeff"],
        })
      ).media_preference,
    ).toBe("both");
    expect(
      (
        await parseIntent("show me beach videos", {
          preferFallback: true,
        })
      ).media_preference,
    ).toBe("videos");
  });
});
