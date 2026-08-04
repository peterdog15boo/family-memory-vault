import { describe, expect, it } from "vitest";
import {
  ensureFaceAwareMovieSettings,
  faceAwareMovieMotionDefaults,
} from "@/lib/movies/settings";

describe("face-aware movie settings", () => {
  it("matches Memories Create Movie motion defaults", () => {
    expect(faceAwareMovieMotionDefaults()).toEqual({
      zoomIntensity: "medium",
      zoomDirection: "alternate",
      photoDurationMs: 3200,
      qualityMode: "standard",
    });
  });

  it("never leaves zoom or direction off", () => {
    const fixed = ensureFaceAwareMovieSettings({
      zoomIntensity: "off",
      zoomDirection: "off",
      qualityMode: "fast",
    });
    expect(fixed.zoomIntensity).toBe("medium");
    expect(fixed.zoomDirection).toBe("alternate");
    expect(fixed.qualityMode).toBe("standard");
  });

  it("preserves strong memorial zoom", () => {
    const fixed = ensureFaceAwareMovieSettings({
      zoomIntensity: "strong",
      zoomDirection: "alternate",
    });
    expect(fixed.zoomIntensity).toBe("strong");
    expect(fixed.zoomDirection).toBe("alternate");
  });
});
