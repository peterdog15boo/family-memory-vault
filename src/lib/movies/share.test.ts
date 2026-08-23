import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildSocialIntentUrl,
  moviePublicShareUrl,
  movieShareText,
  movieShareTokenFromUrl,
  movieShareUrl,
  movieSocialShareUrl,
  movieSocialUsesPublicLink,
  navigateShareIntent,
  openShareIntentPlaceholder,
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
    const movie = sampleMovie({
      shareUrl: "https://app.example/share/movies/tok",
    });
    expect(movieShareUrl(movie)).toBe("https://app.example/share/movies/tok");
  });

  it("parses tokens from new and legacy share paths", () => {
    expect(
      movieShareTokenFromUrl("https://app.example/share/movies/abc123"),
    ).toBe("abc123");
    expect(movieShareTokenFromUrl("https://app.example/share/m/legacy")).toBe(
      "legacy",
    );
  });

  it("builds Facebook / X / Pinterest intents from the public page URL", () => {
    const page = "https://app.example/share/movies/tok123";
    const text = "Watch “Beach day” — made with Family Memory Vault";
    const poster = "https://app.example/api/public/movies/tok123/poster";

    expect(buildSocialIntentUrl("facebook", { sharePageUrl: page, text })).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fapp.example%2Fshare%2Fmovies%2Ftok123",
    );
    expect(buildSocialIntentUrl("x", { sharePageUrl: page, text })).toContain(
      "twitter.com/intent/tweet",
    );
    expect(buildSocialIntentUrl("x", { sharePageUrl: page, text })).toContain(
      encodeURIComponent(page),
    );
    const pin = buildSocialIntentUrl("pinterest", {
      sharePageUrl: page,
      text,
      posterUrl: poster,
    });
    expect(pin).toContain("pinterest.com/pin/create/button");
    expect(pin).toContain(encodeURIComponent(page));
    expect(pin).toContain(encodeURIComponent(poster));
  });

  it("refuses social intents when only a CDN MP4 exists", () => {
    expect(movieSocialShareUrl("facebook", sampleMovie())).toBeNull();
    expect(moviePublicShareUrl(sampleMovie())).toBeNull();
  });

  it("keeps Instagram and TikTok as non-link networks", () => {
    expect(movieSocialUsesPublicLink("instagram")).toBe(false);
    expect(movieSocialUsesPublicLink("facebook")).toBe(true);
  });

  it("includes product name in share text", () => {
    expect(movieShareText(sampleMovie())).toMatch(/Family Memory Vault/);
  });

  it("navigates a placeholder tab to the intent URL", () => {
    const fakeWin = {
      closed: false,
      focus: vi.fn(),
      location: { href: "about:blank", replace: vi.fn() },
    };
    vi.stubGlobal("window", { open: () => null });
    const result = navigateShareIntent(
      "https://www.facebook.com/sharer/sharer.php?u=x",
      fakeWin as unknown as Window,
    );
    expect(result.opened).toBe(true);
    expect(fakeWin.location.replace).toHaveBeenCalled();
  });

  it("reports blocked when placeholder and window.open both fail", () => {
    vi.stubGlobal("window", { open: () => null });
    expect(
      navigateShareIntent("https://www.facebook.com/sharer/sharer.php?u=x", null),
    ).toEqual({ opened: false, blocked: true });
  });

  it("openShareIntentPlaceholder returns the window", () => {
    const fakeWin = {
      closed: false,
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    };
    vi.stubGlobal("window", { open: () => fakeWin });
    expect(openShareIntentPlaceholder()).toBe(fakeWin);
  });
});
