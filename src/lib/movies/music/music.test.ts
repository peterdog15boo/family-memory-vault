import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  getLibraryTrack,
  LIBRARY_MUSIC_LICENSE,
  listLibraryTracksByCategory,
  MUSIC_CATEGORIES,
  MOVIE_LIBRARY_TRACKS,
  resolveSuggestionToLibraryId,
} from "@/lib/movies/music/library";
import { libraryTrackAbsolutePath } from "@/lib/movies/music/resolve";
import {
  movieSettingsRequestMusic,
  normalizeMovieSettings,
  validateMovieMusicSettings,
} from "@/lib/movies/settings";
import { clampFaceBox } from "@/lib/movies/framing-cache";
import { normalizeBox } from "@/lib/faces/providers/types";

describe("movie music library", () => {
  it("ships a curated multi-category catalog", () => {
    expect(MOVIE_LIBRARY_TRACKS.length).toBeGreaterThanOrEqual(18);
    expect(MUSIC_CATEGORIES).toEqual([
      "warm_family",
      "cinematic",
      "holiday",
      "upbeat",
      "soft_piano",
      "memorial_reflective",
      "bright_social",
    ]);
  });

  it("gives every track mood tags, attribution, and a unique id", () => {
    const ids = new Set<string>();
    for (const track of MOVIE_LIBRARY_TRACKS) {
      expect(track.moodTags.length).toBeGreaterThan(0);
      expect(track.attribution).toMatch(/Kevin MacLeod/);
      expect(track.filename).toMatch(/\.mp3$/);
      expect(ids.has(track.id)).toBe(false);
      ids.add(track.id);
    }
  });

  it("covers every category with at least two beds", () => {
    for (const category of MUSIC_CATEGORIES) {
      expect(
        listLibraryTracksByCategory(category).length,
        category,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("maps legacy suggestion ids to library tracks", () => {
    expect(resolveSuggestionToLibraryId("simple-soft-piano")).toBe(
      "soft-piano",
    );
    expect(resolveSuggestionToLibraryId("cinematic-ambient")).toBe(
      "ambient-pads",
    );
    expect(resolveSuggestionToLibraryId("memorial-soft")).toBe(
      "soft-farewell",
    );
    expect(resolveSuggestionToLibraryId("social-bright")).toBe("social-spark");
    expect(resolveSuggestionToLibraryId("upbeat-pop")).toBe("upbeat-pop");
  });

  it("exposes a CC BY license string", () => {
    expect(LIBRARY_MUSIC_LICENSE).toContain("Creative Commons");
    expect(LIBRARY_MUSIC_LICENSE).toContain("incompetech.com");
  });

  it("looks up tracks by id", () => {
    expect(getLibraryTrack("film-rise")?.label).toBe("Film Rise");
    expect(getLibraryTrack("missing")).toBeNull();
  });
});

describe("movie music settings", () => {
  it("normalizes library selection fields for persistence", () => {
    const n = normalizeMovieSettings({
      musicSource: "library",
      musicTrackId: "soft-farewell",
      musicLabel: "Soft Farewell",
      musicVolume: 0.5,
      musicFadeInMs: 1000,
      musicFadeOutMs: 2000,
      musicLoop: true,
    });
    expect(n.musicSource).toBe("library");
    expect(n.musicTrackId).toBe("soft-farewell");
    expect(n.musicLabel).toBe("Soft Farewell");
    expect(n.musicVolume).toBe(0.5);
    expect(n.musicFadeInMs).toBe(1000);
    expect(n.musicFadeOutMs).toBe(2000);
    expect(n.musicLoop).toBe(true);
  });

  it("infers upload source from musicUploadKey", () => {
    const n = normalizeMovieSettings({
      musicUploadKey: "movies/user/music/abc.mp3",
      musicLabel: "My song",
    });
    expect(n.musicSource).toBe("upload");
    expect(n.musicUploadKey).toContain("music/");
  });

  it("defaults to no music", () => {
    expect(normalizeMovieSettings({}).musicSource).toBe("none");
  });

  it("recovers library source when trackId is set but source was none", () => {
    const n = normalizeMovieSettings({
      musicSource: "none",
      musicTrackId: "soft-piano",
      musicVolume: 0.7,
    });
    expect(n.musicSource).toBe("library");
    expect(n.musicTrackId).toBe("soft-piano");
    expect(movieSettingsRequestMusic(n)).toBe(true);
  });

  it("validateMovieMusicSettings rejects library without a track", () => {
    const check = validateMovieMusicSettings({
      ...normalizeMovieSettings({}),
      musicSource: "library",
      musicTrackId: null,
      musicSuggestionId: null,
      musicUploadKey: null,
    });
    expect(check.ok).toBe(false);
  });

  it("validateMovieMusicSettings accepts a library track", () => {
    const n = normalizeMovieSettings({
      musicSource: "library",
      musicTrackId: "soft-piano",
    });
    expect(validateMovieMusicSettings(n)).toEqual({ ok: true });
  });

  it("keeps music when an unrelated settings field is invalid", () => {
    const n = normalizeMovieSettings({
      musicSource: "library",
      musicTrackId: "soft-piano",
      musicVolume: 0.6,
      // @ts-expect-error intentional unknown transition to prove partial recover
      transition: "legacy_wipe_that_does_not_exist",
    });
    expect(n.musicSource).toBe("library");
    expect(n.musicTrackId).toBe("soft-piano");
    expect(n.musicVolume).toBe(0.6);
    expect(movieSettingsRequestMusic(n)).toBe(true);
  });

  it("resolves library mp3 files on disk for the encode worker", () => {
    const track = getLibraryTrack("soft-piano");
    expect(track).not.toBeNull();
    const path = libraryTrackAbsolutePath(track!);
    expect(existsSync(path), `missing ${path}`).toBe(true);
  });
});

describe("face box clamp for movie framing", () => {
  it("keeps edge Rekognition boxes instead of dropping them", () => {
    const clamped = clampFaceBox({ x: 0.72, y: 0.1, width: 0.35, height: 0.3 });
    expect(clamped).not.toBeNull();
    expect(clamped!.x + clamped!.width).toBeLessThanOrEqual(1.0001);
    expect(clamped!.width).toBeGreaterThan(0.2);
  });

  it("normalizeBox also keeps boxes inside the unit square", () => {
    const n = normalizeBox({ x: 0.8, y: 0.75, width: 0.4, height: 0.4 });
    expect(n.x + n.width).toBeLessThanOrEqual(1.0001);
    expect(n.y + n.height).toBeLessThanOrEqual(1.0001);
  });
});
