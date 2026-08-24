import { describe, expect, it } from "vitest";
import {
  MEMORY_MOVIE_ABSOLUTE_MAX_CLIPS,
  resolveMemoryMovieClipCap,
} from "@/lib/movies/generator";

describe("resolveMemoryMovieClipCap", () => {
  it("does not use the legacy fast-mode 12-clip silent half-set", () => {
    const cap = resolveMemoryMovieClipCap({
      fast: true,
      themeMaxClips: 40,
    });
    expect(cap).toBe(MEMORY_MOVIE_ABSOLUTE_MAX_CLIPS);
    expect(cap).toBeGreaterThanOrEqual(24);
    expect(cap).not.toBe(12);
  });

  it("ignores theme maxClips so a 24-item Memory is not truncated at 40→half", () => {
    expect(
      resolveMemoryMovieClipCap({ fast: false, themeMaxClips: 12 }),
    ).toBeGreaterThanOrEqual(24);
  });
});
