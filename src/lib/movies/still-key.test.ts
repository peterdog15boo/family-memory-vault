import { describe, expect, it } from "vitest";
import { pickMovieStillKey } from "@/lib/movies/generator";

describe("pickMovieStillKey", () => {
  it("prefers original over processed display JPEG for photos", () => {
    expect(
      pickMovieStillKey({
        type: "photo",
        contentType: "image/jpeg",
        originalKey: "originals/u/m/photo.jpg",
        processedKey: "processed/u/m-display.jpg",
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBe("originals/u/m/photo.jpg");
  });

  it("falls back to processed when original is missing", () => {
    expect(
      pickMovieStillKey({
        type: "photo",
        contentType: "image/jpeg",
        originalKey: "",
        processedKey: "processed/u/m-display.jpg",
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBe("processed/u/m-display.jpg");
  });

  it("never uses thumbnailKey for movie frames", () => {
    expect(
      pickMovieStillKey({
        type: "photo",
        contentType: "image/jpeg",
        originalKey: "",
        processedKey: null,
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBeNull();
  });

  it("uses processed still for video and ignores thumbnail posters", () => {
    expect(
      pickMovieStillKey({
        type: "video",
        contentType: "video/mp4",
        originalKey: "originals/u/m/clip.mp4",
        processedKey: "processed/u/m-still.jpg",
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBe("processed/u/m-still.jpg");

    expect(
      pickMovieStillKey({
        type: "video",
        contentType: "video/mp4",
        originalKey: "originals/u/m/clip.mp4",
        processedKey: null,
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBeNull();
  });
});

describe("pickMovieVideoKey", () => {
  it("uses the original video object for trimmed playback", async () => {
    const { pickMovieVideoKey } = await import("@/lib/movies/generator");
    expect(
      pickMovieVideoKey({
        type: "video",
        contentType: "video/mp4",
        originalKey: "originals/u/m/clip.mp4",
        processedKey: null,
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBe("originals/u/m/clip.mp4");
  });
});
