import { describe, expect, it } from "vitest";
import {
  movieSourceMaxLongEdge,
  pickMovieStillKey,
  pickMovieVideoKey,
} from "@/lib/movies/generator";

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

  it("never prefers thumbnailKey when a fuller source exists", () => {
    expect(
      pickMovieStillKey({
        type: "photo",
        contentType: "image/jpeg",
        originalKey: "originals/u/m/photo.jpg",
        processedKey: null,
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBe("originals/u/m/photo.jpg");

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

  it("uses thumbnailKey only as absolute last resort", () => {
    expect(
      pickMovieStillKey({
        type: "photo",
        contentType: "image/jpeg",
        originalKey: "",
        processedKey: null,
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBe("thumbnails/u/m.jpg");
  });

  it("uses processed still for video helpers and ignores thumbnail posters", () => {
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
  it("uses the original video object for trimmed playback", () => {
    expect(
      pickMovieVideoKey({
        type: "video",
        contentType: "video/mp4",
        originalKey: "originals/u/m/clip.mp4",
        processedKey: "processed/u/m-playback.mp4",
        thumbnailKey: "thumbnails/u/m.jpg",
      }),
    ).toBe("originals/u/m/clip.mp4");
  });
});

describe("movieSourceMaxLongEdge", () => {
  it("does not early-downscale typical phone originals for 1080p", () => {
    const max = movieSourceMaxLongEdge({
      fast: false,
      outputWidth: 1920,
      outputHeight: 1080,
    });
    // 12MP phones (~4032×3024) and 4K stills must pass through intact.
    expect(max).toBeGreaterThanOrEqual(8192);
    expect(max).toBeGreaterThan(4032);
    expect(max).toBeGreaterThan(4096);
  });

  it("keeps a leaner ceiling on the fast draft path", () => {
    expect(
      movieSourceMaxLongEdge({
        fast: true,
        outputWidth: 1280,
        outputHeight: 720,
      }),
    ).toBe(2560);
  });
});
