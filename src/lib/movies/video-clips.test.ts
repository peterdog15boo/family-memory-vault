import { describe, expect, it } from "vitest";
import {
  buildNormalizeVideoClipArgs,
  isMovieVideoMedia,
  resolveVideoClipDurationMs,
  MAX_VIDEO_CLIP_MS,
  MIN_VIDEO_CLIP_MS,
} from "@/lib/movies/video-clips";

describe("resolveVideoClipDurationMs", () => {
  it("uses source duration when under the cap", () => {
    expect(
      resolveVideoClipDurationMs({
        sourceDurationMs: 8500,
        photoDurationMs: 3200,
      }),
    ).toBe(8500);
  });

  it("caps long videos", () => {
    expect(
      resolveVideoClipDurationMs({
        sourceDurationMs: 120_000,
        photoDurationMs: 3200,
      }),
    ).toBe(MAX_VIDEO_CLIP_MS);
  });

  it("falls back when duration unknown", () => {
    const d = resolveVideoClipDurationMs({
      sourceDurationMs: null,
      photoDurationMs: 3200,
    });
    expect(d).toBeGreaterThanOrEqual(MIN_VIDEO_CLIP_MS);
    expect(d).toBe(6400);
  });

  it("never goes below the minimum", () => {
    expect(
      resolveVideoClipDurationMs({
        sourceDurationMs: 400,
        photoDurationMs: 3200,
      }),
    ).toBe(MIN_VIDEO_CLIP_MS);
  });
});

describe("isMovieVideoMedia", () => {
  it("detects type and contentType", () => {
    expect(isMovieVideoMedia({ type: "video", contentType: "image/jpeg" })).toBe(
      true,
    );
    expect(
      isMovieVideoMedia({ type: "photo", contentType: "video/mp4" }),
    ).toBe(true);
    expect(
      isMovieVideoMedia({ type: "photo", contentType: "image/jpeg" }),
    ).toBe(false);
  });
});

describe("buildNormalizeVideoClipArgs", () => {
  it("includes trim, scale filter, and muted audio", () => {
    const args = buildNormalizeVideoClipArgs({
      inputPath: "in.mov",
      outputPath: "out.mp4",
      durationMs: 5000,
      width: 1920,
      height: 1080,
      fps: 30,
      output: {
        x264Preset: "slow",
        crf: 15,
        profile: "high",
        level: "4.2",
        maxrate: "12M",
        bufsize: "24M",
      },
    });
    expect(args).toContain("-t");
    expect(args).toContain("5.000");
    expect(args).toContain("-an");
    expect(args).toContain("-vf");
    expect(args.at(-1)).toBe("out.mp4");
  });
});
