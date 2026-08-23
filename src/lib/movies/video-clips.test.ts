import { describe, expect, it } from "vitest";
import {
  buildNormalizeVideoClipArgs,
  findNextMediaClip,
  findPrevMediaClip,
  isMovieVideoMedia,
  photoTransitionWindows,
  resolveVideoClipDurationMs,
  MAX_VIDEO_CLIP_MS,
  MAX_VIDEO_CLIP_MS_FAST,
  MIN_VIDEO_CLIP_MS,
} from "@/lib/movies/video-clips";

describe("resolveVideoClipDurationMs", () => {
  it("uses source duration when under the safety ceiling", () => {
    expect(
      resolveVideoClipDurationMs({
        sourceDurationMs: 85_000,
        photoDurationMs: 3200,
      }),
    ).toBe(85_000);
  });

  it("allows multi-minute home videos (not still pacing)", () => {
    expect(
      resolveVideoClipDurationMs({
        sourceDurationMs: 180_000,
        photoDurationMs: 3600,
      }),
    ).toBe(180_000);
  });

  it("applies a safety ceiling for pathological lengths", () => {
    expect(
      resolveVideoClipDurationMs({
        sourceDurationMs: 60 * 60 * 1000,
        photoDurationMs: 3200,
      }),
    ).toBe(MAX_VIDEO_CLIP_MS);
  });

  it("uses a shorter ceiling in fast mode", () => {
    expect(
      resolveVideoClipDurationMs({
        sourceDurationMs: 180_000,
        photoDurationMs: 3200,
        fast: true,
      }),
    ).toBe(MAX_VIDEO_CLIP_MS_FAST);
  });

  it("honors an explicit Expert Mode trim", () => {
    expect(
      resolveVideoClipDurationMs({
        sourceDurationMs: 180_000,
        photoDurationMs: 3200,
        maxDurationMs: 12_000,
      }),
    ).toBe(12_000);
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

describe("photoTransitionWindows", () => {
  const clips = [
    { kind: "title" as const },
    { kind: "photo" as const },
    { kind: "video" as const },
    { kind: "photo" as const },
  ];

  it("does not trail-dissolve a photo into a later photo across a video", () => {
    const windows = photoTransitionWindows({
      clips,
      clipIdx: 1,
      transitionMs: 500,
    });
    expect(windows.leadMs).toBe(0);
    expect(windows.trailMs).toBe(0);
    expect(windows.nextPhoto).toBe(false);
  });

  it("dissolves photo→photo when they are immediate neighbors", () => {
    const photoPhoto = [
      { kind: "photo" as const },
      { kind: "photo" as const },
    ];
    const first = photoTransitionWindows({
      clips: photoPhoto,
      clipIdx: 0,
      transitionMs: 500,
    });
    expect(first.trailMs).toBe(500);
    expect(first.nextPhoto).toBe(true);

    const second = photoTransitionWindows({
      clips: photoPhoto,
      clipIdx: 1,
      transitionMs: 500,
    });
    expect(second.leadMs).toBe(500);
    expect(second.trailMs).toBe(0);
  });

  it("hard-cuts after a video into the next photo", () => {
    const windows = photoTransitionWindows({
      clips,
      clipIdx: 3,
      transitionMs: 500,
    });
    expect(windows.leadMs).toBe(0);
    expect(findPrevMediaClip(clips, 3)?.kind).toBe("video");
    expect(findNextMediaClip(clips, 1)?.kind).toBe("video");
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
  it("includes trim, cover fill-frame filter, and muted audio", () => {
    const args = buildNormalizeVideoClipArgs({
      inputPath: "in.mov",
      outputPath: "out.mp4",
      durationMs: 5000,
      width: 1920,
      height: 1080,
      fps: 30,
      output: {
        x264Preset: "slow",
        crf: 14,
        profile: "high",
        level: "4.2",
        maxrate: "16M",
        bufsize: "32M",
      },
      focalX: 0.42,
      focalY: 0.38,
    });
    expect(args).toContain("-t");
    expect(args).toContain("5.000");
    expect(args).toContain("-an");
    expect(args).toContain("-vf");
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("force_original_aspect_ratio=increase");
    expect(vf).toContain("crop=1920:1080");
    expect(vf).toContain("0.4200");
    expect(vf).not.toContain("pad=");
    expect(args.at(-1)).toBe("out.mp4");
  });
});
