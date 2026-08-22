import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHOTO_REQUEST_MESSAGE,
  PHOTO_REQUEST_PRESETS,
} from "@/lib/photo-requests/copy";
import { movieShareText, movieShareUrl } from "@/lib/movies/share";
import type { SerializedMovie } from "@/lib/movies/serialize";

function sampleMovie(
  partial: Partial<SerializedMovie> = {},
): SerializedMovie {
  return {
    id: "mov_1",
    memoryId: "mem_1",
    title: "Beach day",
    status: "ready",
    style: "simple",
    styleLabel: "Simple",
    settings: {},
    durationSeconds: 12,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    playUrl: "https://cdn.example/play.mp4",
    downloadUrl: "https://cdn.example/play.mp4",
    thumbnailUrl: null,
    urlsExpireAt: null,
    ...partial,
  };
}

describe("movie share helpers", () => {
  it("prefers durable shareUrl over signed R2 URLs", () => {
    const movie = sampleMovie({
      shareUrl: "https://app.example/share/m/tok",
    });
    expect(movieShareUrl(movie)).toBe("https://app.example/share/m/tok");
  });

  it("falls back to download/play when shareUrl is missing", () => {
    expect(movieShareUrl(sampleMovie())).toContain("cdn.example");
  });

  it("includes product name in share text", () => {
    expect(movieShareText(sampleMovie())).toMatch(/Family Memory Vault/);
  });
});

describe("photo request presets", () => {
  it("keeps wedding-photos example as the default", () => {
    expect(DEFAULT_PHOTO_REQUEST_MESSAGE).toMatch(/wedding photos/i);
    expect(PHOTO_REQUEST_PRESETS[0]).toBe(DEFAULT_PHOTO_REQUEST_MESSAGE);
  });
});
