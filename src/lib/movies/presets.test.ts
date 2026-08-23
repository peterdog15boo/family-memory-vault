import { describe, expect, it } from "vitest";
import {
  getMoviePreset,
  MOVIE_PRESETS,
  resolveMoviePresetId,
} from "@/lib/movies/presets";

describe("movie presets", () => {
  it("ships the production preset set", () => {
    expect(MOVIE_PRESETS.map((p) => p.id)).toEqual([
      "simple_mode",
      "classic_family",
      "holiday_card",
      "cinematic_tribute",
      "social_story",
      "clean_slideshow",
    ]);
  });

  it("resolves legacy preset aliases", () => {
    expect(resolveMoviePresetId("cinematic_story")).toBe("cinematic_tribute");
    expect(resolveMoviePresetId("fast_memories")).toBe("clean_slideshow");
    expect(resolveMoviePresetId("simple")).toBe("simple_mode");
    expect(getMoviePreset("cinematic_story")?.label).toBe("Cinematic Tribute");
  });

  it("Simple Mode skips title cards and uses soft dissolve", () => {
    expect(getMoviePreset("simple_mode")).toMatchObject({
      includeTitles: false,
      transition: "soft_dissolve",
      qualityMode: "standard",
    });
  });

  it("Social Story is vertical 9:16", () => {
    expect(getMoviePreset("social_story")).toMatchObject({
      aspectRatio: "9:16",
      transition: "push",
    });
  });

  it("Clean Slideshow turns titles and music off", () => {
    expect(getMoviePreset("clean_slideshow")).toMatchObject({
      includeTitles: false,
      musicSource: "none",
      colorFilter: "clean",
    });
  });
});
