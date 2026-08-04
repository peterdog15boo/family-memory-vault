import { describe, expect, it } from "vitest";
import {
  cropCenterNormalized,
  isMovieFaceDebugEnabled,
  summarizeCropFocalTracking,
} from "@/lib/movies/face-debug";
import { computeFramingFromFaces, sourceCropAtScale } from "@/lib/movies/framing";

describe("face-debug helpers", () => {
  it("is off unless MOVIE_FACE_DEBUG is set", () => {
    const prev = process.env.MOVIE_FACE_DEBUG;
    delete process.env.MOVIE_FACE_DEBUG;
    expect(isMovieFaceDebugEnabled()).toBe(false);
    process.env.MOVIE_FACE_DEBUG = "1";
    expect(isMovieFaceDebugEnabled()).toBe(true);
    if (prev === undefined) delete process.env.MOVIE_FACE_DEBUG;
    else process.env.MOVIE_FACE_DEBUG = prev;
  });

  it("summarizes crop centers vs face focal for a portrait zoom", () => {
    const framing = computeFramingFromFaces([
      { x: 0.4, y: 0.2, width: 0.2, height: 0.28 },
    ]);
    const crops = [1, 1.08, 1.15].map((scale) =>
      sourceCropAtScale({
        scale,
        sourceWidth: 2400,
        sourceHeight: 1800,
        targetWidth: 1920,
        targetHeight: 1080,
        framing,
      }),
    );
    const summary = summarizeCropFocalTracking({
      crops,
      framing,
      sourceWidth: 2400,
      sourceHeight: 1800,
    });
    expect(summary.sampleCount).toBe(3);
    expect(summary.meanAbsDx).toBeLessThan(0.1);
    expect(summary.meanAbsDy).toBeLessThan(0.1);
    const mid = cropCenterNormalized(crops[1]!, 2400, 1800);
    expect(Math.abs(mid.x - framing.focalPointX)).toBeLessThan(0.1);
  });
});
