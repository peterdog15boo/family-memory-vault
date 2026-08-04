import { describe, expect, it } from "vitest";
import { estimateMovieRenderTime } from "@/lib/movies/estimate";

describe("estimateMovieRenderTime", () => {
  it("scales with photo count", () => {
    const small = estimateMovieRenderTime({ photoCount: 4 });
    const larger = estimateMovieRenderTime({ photoCount: 12 });
    expect(larger.maxSeconds).toBeGreaterThan(small.maxSeconds);
    expect(small.label.length).toBeGreaterThan(5);
  });

  it("treats ultra as slower than fast", () => {
    const fast = estimateMovieRenderTime({
      photoCount: 8,
      qualityMode: "fast",
    });
    const ultra = estimateMovieRenderTime({
      photoCount: 8,
      qualityMode: "ultra",
    });
    expect(ultra.minSeconds).toBeGreaterThan(fast.minSeconds);
  });
});
