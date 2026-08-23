import { describe, expect, it } from "vitest";
import { pickVideoPosterSeekSec } from "@/lib/media/video-poster-seek";

describe("pickVideoPosterSeekSec", () => {
  it("defaults to 2s when duration is unknown", () => {
    expect(pickVideoPosterSeekSec(null)).toBe(2);
    expect(pickVideoPosterSeekSec(0)).toBe(2);
  });

  it("uses ~40% for short clips", () => {
    expect(pickVideoPosterSeekSec(3)).toBeCloseTo(1.2, 5);
  });

  it("uses the midpoint (at least 2s) for longer clips", () => {
    expect(pickVideoPosterSeekSec(10)).toBe(5);
    expect(pickVideoPosterSeekSec(5)).toBe(2.5);
    expect(pickVideoPosterSeekSec(120)).toBe(60);
  });
});
