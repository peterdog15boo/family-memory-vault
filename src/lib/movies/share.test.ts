import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildSocialIntentUrl,
  moviePublicShareUrl,
  movieShareText,
  movieShareTokenFromUrl,
  movieShareUrl,
  normalizePublicSharePageUrl,
  openSocialIntentWindow,
  shareToSocialNetwork,
} from "@/lib/movies/share";
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
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("prefers durable shareUrl over signed R2 URLs", () => {
    expect(
      movieShareUrl(
        sampleMovie({ shareUrl: "https://app.example/share/movies/tok" }),
      ),
    ).toBe("https://app.example/share/movies/tok");
    expect(moviePublicShareUrl(sampleMovie())).toBeNull();
  });

  it("parses tokens from /share/movies paths", () => {
    expect(
      movieShareTokenFromUrl("https://app.example/share/movies/abc123"),
    ).toBe("abc123");
  });

  it("builds Facebook / X / Pinterest intents from the public page", () => {
    const page = "https://app.example/share/movies/tok123";
    const text = movieShareText(sampleMovie());
    expect(buildSocialIntentUrl("facebook", { sharePageUrl: page, text })).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fapp.example%2Fshare%2Fmovies%2Ftok123",
    );
    expect(buildSocialIntentUrl("x", { sharePageUrl: page, text })).toContain(
      "twitter.com/intent/tweet",
    );
    expect(
      buildSocialIntentUrl("pinterest", {
        sharePageUrl: page,
        text,
        posterUrl: "https://app.example/api/public/movies/tok123/poster",
      }),
    ).toContain("pinterest.com/pin/create/button");
  });

  it("normalizes share URLs to the current origin when available", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://current.example" },
    });
    expect(
      normalizePublicSharePageUrl("https://other.example/share/movies/t1"),
    ).toBe("https://current.example/share/movies/t1");
  });

  it("openSocialIntentWindow reports null opens as blocked", () => {
    vi.stubGlobal("window", { open: () => null });
    expect(openSocialIntentWindow("https://www.facebook.com/sharer/sharer.php?u=x")).toEqual(
      {
        opened: false,
        blocked: true,
        windowOpenReturnedNull: true,
      },
    );
  });

  it("shareToSocialNetwork copies when window.open is blocked", async () => {
    vi.stubGlobal("window", {
      open: () => null,
      location: { origin: "https://app.example" },
    });
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
    const result = await shareToSocialNetwork({
      network: "facebook",
      sharePageUrl: "https://app.example/share/movies/tok",
      text: "hi",
    });
    expect(result.opened).toBe(false);
    expect(result.copied).toBe(true);
    expect(result.intentUrl).toContain("facebook.com/sharer");
  });
});
