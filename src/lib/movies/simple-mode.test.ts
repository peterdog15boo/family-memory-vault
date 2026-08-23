import { describe, expect, it } from "vitest";
import {
  buildSimpleModeSettings,
  formatMovieAutoTitle,
  parseMovieAutoTitleSequence,
  parseMovieCreateMode,
  pickSimpleModeLibraryTrackId,
  SIMPLE_MODE_PRESET_ID,
} from "@/lib/movies/simple-mode";
import { getLibraryTrack } from "@/lib/movies/music/library";
import { getMoviePreset } from "@/lib/movies/presets";

describe("movie auto-title helpers", () => {
  it("formats Movie 001 style titles", () => {
    expect(formatMovieAutoTitle(1)).toBe("Movie 001");
    expect(formatMovieAutoTitle(12)).toBe("Movie 012");
    expect(formatMovieAutoTitle(100)).toBe("Movie 100");
  });

  it("parses Movie NNN sequences", () => {
    expect(parseMovieAutoTitleSequence("Movie 001")).toBe(1);
    expect(parseMovieAutoTitleSequence("movie 42")).toBe(42);
    expect(parseMovieAutoTitleSequence("Family movie")).toBeNull();
  });

  it("defaults create mode to simple", () => {
    expect(parseMovieCreateMode(null)).toBe("simple");
    expect(parseMovieCreateMode("expert")).toBe("expert");
    expect(parseMovieCreateMode("nope")).toBe("simple");
  });
});

describe("simple mode preset", () => {
  it("exists and disables title cards", () => {
    const preset = getMoviePreset(SIMPLE_MODE_PRESET_ID);
    expect(preset).not.toBeNull();
    expect(preset!.includeTitles).toBe(false);
    expect(preset!.transition).toBe("soft_dissolve");
    expect(preset!.qualityMode).toBe("standard");
  });

  it("builds face-aware settings without titles", () => {
    const settings = buildSimpleModeSettings({ random: () => 0 });
    expect(settings.includeTitles).toBe(false);
    expect(settings.posterStyle).toBe("photo");
    expect(settings.presetId).toBe(SIMPLE_MODE_PRESET_ID);
    expect(settings.transition).toBe("soft_dissolve");
    expect(settings.transitionDurationMs).toBe(900);
    expect(settings.aspectRatio).toBe("16:9");
    expect(settings.zoomIntensity).not.toBe("off");
    expect(settings.qualityMode).toBe("standard");
    expect(settings.photoDurationMs).toBe(3600);
    expect(settings.musicSource).toBe("library");
    expect(settings.musicTrackId).toBeTruthy();
    expect(getLibraryTrack(settings.musicTrackId)).not.toBeNull();
    expect(settings.musicFadeInMs).toBe(800);
    expect(settings.musicFadeOutMs).toBe(1200);
  });

  it("randomizes library tracks and skips the previous track when possible", () => {
    const first = pickSimpleModeLibraryTrackId({
      candidates: ["soft-piano", "morning-keys", "quiet-keys"],
      random: () => 0,
    });
    expect(first).toBe("soft-piano");

    const second = pickSimpleModeLibraryTrackId({
      candidates: ["soft-piano", "morning-keys", "quiet-keys"],
      excludeTrackId: first,
      random: () => 0,
    });
    expect(second).toBe("morning-keys");
    expect(second).not.toBe(first);
  });

  it("fails soft with null when no candidates are available", () => {
    expect(
      pickSimpleModeLibraryTrackId({ candidates: [], random: () => 0 }),
    ).toBeNull();
  });

  it("keeps the only available track even when it was excluded", () => {
    expect(
      pickSimpleModeLibraryTrackId({
        candidates: ["soft-piano"],
        excludeTrackId: "soft-piano",
        random: () => 0,
      }),
    ).toBe("soft-piano");
  });
});
