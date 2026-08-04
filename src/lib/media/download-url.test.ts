import { describe, expect, it } from "vitest";
import { resolveMediaObjectKey } from "@/lib/media/download-url";

describe("resolveMediaObjectKey", () => {
  const photo = {
    type: "photo" as const,
    contentType: "image/jpeg",
    thumbnailKey: "thumbnails/u/m.jpg",
    processedKey: "processed/u/m-display.jpg",
    originalKey: "originals/u/m.jpg",
  };

  it("uses thumbnail key for grid purpose", () => {
    expect(resolveMediaObjectKey(photo, "thumbnail")?.key).toBe(
      photo.thumbnailKey,
    );
  });

  it("prefers display JPEG over original for photo display", () => {
    expect(resolveMediaObjectKey(photo, "display")).toEqual({
      key: photo.processedKey,
      contentType: "image/jpeg",
    });
  });

  it("falls back to original when display derivative is missing", () => {
    const noDisplay = { ...photo, processedKey: null };
    expect(resolveMediaObjectKey(noDisplay, "display")).toEqual({
      key: photo.originalKey,
      contentType: "image/jpeg",
      fallbackToOriginal: true,
    });
  });

  it("always uses original for video display/playback", () => {
    const video = {
      type: "video" as const,
      contentType: "video/mp4",
      thumbnailKey: "thumbnails/u/v.jpg",
      processedKey: null,
      originalKey: "originals/u/v.mp4",
    };
    expect(resolveMediaObjectKey(video, "display")).toEqual({
      key: video.originalKey,
      contentType: "video/mp4",
      fallbackToOriginal: true,
    });
  });

  it("returns null when thumbnail is missing", () => {
    expect(
      resolveMediaObjectKey({ ...photo, thumbnailKey: null }, "thumbnail"),
    ).toBeNull();
  });
});
