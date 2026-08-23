import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DEFAULT_PHOTO_REQUEST_MESSAGE,
  PHOTO_REQUEST_PRESETS,
} from "@/lib/photo-requests/copy";
import {
  moviePublicShareUrl,
  movieShareText,
  movieShareUrl,
  movieSocialShareUrl,
  movieSocialUsesPublicLink,
  navigateShareTab,
  openBlankShareTab,
  openMovieSocialShare,
  tryOpenExternalUrl,
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
      shareUrl: "https://app.example/share/m/tok",
    });
    expect(movieShareUrl(movie)).toBe("https://app.example/share/m/tok");
  });

  it("falls back to download/play when shareUrl is missing", () => {
    expect(movieShareUrl(sampleMovie())).toContain("cdn.example");
  });

  it("exposes public share URL separately from CDN fallbacks", () => {
    expect(moviePublicShareUrl(sampleMovie())).toBeNull();
    expect(
      moviePublicShareUrl(
        sampleMovie({ shareUrl: "https://app.example/share/m/tok" }),
      ),
    ).toBe("https://app.example/share/m/tok");
  });

  it("includes product name in share text", () => {
    expect(movieShareText(sampleMovie())).toMatch(/Family Memory Vault/);
  });

  it("builds Facebook sharer.php with the public share page URL", () => {
    const movie = sampleMovie({
      shareUrl: "https://app.example/share/m/tok123",
    });
    const href = movieSocialShareUrl("facebook", movie);
    expect(href).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fapp.example%2Fshare%2Fm%2Ftok123",
    );
    expect(movieSocialUsesPublicLink("facebook")).toBe(true);
  });

  it("refuses Facebook share when only a CDN MP4 URL exists", () => {
    expect(movieSocialShareUrl("facebook", sampleMovie())).toBeNull();
  });

  it("keeps Instagram and TikTok as non-link networks", () => {
    const movie = sampleMovie({
      shareUrl: "https://app.example/share/m/tok",
    });
    expect(movieSocialShareUrl("instagram", movie)).toBeNull();
    expect(movieSocialShareUrl("tiktok", movie)).toBeNull();
    expect(movieSocialUsesPublicLink("instagram")).toBe(false);
  });

  it("reports blocked when window.open returns null", () => {
    vi.stubGlobal("window", {
      open: () => null,
    });
    expect(
      navigateShareTab("https://www.facebook.com/sharer/sharer.php?u=x"),
    ).toEqual({ opened: false, blocked: true });
    expect(
      tryOpenExternalUrl("https://www.facebook.com/sharer/sharer.php?u=x"),
    ).toEqual({ opened: false, blocked: true });
  });

  it("navigates a pre-opened blank tab", () => {
    const fakeWin = {
      closed: false,
      focus: vi.fn(),
      location: { href: "about:blank", assign: vi.fn() },
      opener: {} as Window | null,
    };
    vi.stubGlobal("window", {
      open: () => null,
    });
    // Prefer assign when present.
    fakeWin.location.assign = vi.fn((url: string) => {
      fakeWin.location.href = url;
    });
    const result = navigateShareTab(
      "https://www.facebook.com/sharer/sharer.php?u=x",
      fakeWin as unknown as Window,
    );
    expect(result).toEqual({ opened: true, blocked: false });
    expect(fakeWin.location.assign).toHaveBeenCalled();
    expect(fakeWin.location.href).toContain("facebook.com/sharer");
  });

  it("openBlankShareTab returns the window from window.open", () => {
    const fakeWin = { closed: false };
    vi.stubGlobal("window", {
      open: () => fakeWin,
    });
    expect(openBlankShareTab()).toBe(fakeWin);
  });

  it("openMovieSocialShare returns false when the tab is blocked", () => {
    vi.stubGlobal("window", {
      open: () => null,
    });
    const movie = sampleMovie({
      shareUrl: "https://app.example/share/m/tok",
    });
    expect(openMovieSocialShare("facebook", movie)).toBe(false);
  });
});

describe("photo request presets", () => {
  it("keeps wedding-photos example as the default", () => {
    expect(DEFAULT_PHOTO_REQUEST_MESSAGE).toMatch(/wedding photos/i);
    expect(PHOTO_REQUEST_PRESETS[0]).toBe(DEFAULT_PHOTO_REQUEST_MESSAGE);
  });
});
