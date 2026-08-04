import { describe, expect, it } from "vitest";
import {
  buildEncodeVideoFilter,
  buildLibx264EncodeArgs,
  resolveMovieOutputSpec,
  scaleThemeFontSize,
} from "@/lib/movies/output";

describe("resolveMovieOutputSpec", () => {
  it("defaults standard landscape to sharp 1080p", () => {
    const spec = resolveMovieOutputSpec({
      aspectRatio: "16:9",
      qualityMode: "standard",
    });
    expect(spec).toMatchObject({
      width: 1920,
      height: 1080,
      crf: 15,
      profile: "high",
      fps: 30,
      x264Preset: "slow",
      frameJpegQuality: 99,
      maxrate: "14M",
    });
  });

  it("maps social aspects at 1080p family", () => {
    expect(
      resolveMovieOutputSpec({
        aspectRatio: "9:16",
        qualityMode: "standard",
      }),
    ).toMatchObject({ width: 1080, height: 1920 });

    expect(
      resolveMovieOutputSpec({
        aspectRatio: "1:1",
        qualityMode: "standard",
      }),
    ).toMatchObject({ width: 1080, height: 1080 });
  });

  it("uses 720p-class dims for fast mode while keeping aspect", () => {
    expect(
      resolveMovieOutputSpec({
        aspectRatio: "16:9",
        qualityMode: "fast",
      }),
    ).toMatchObject({ width: 1280, height: 720, x264Preset: "veryfast" });

    expect(
      resolveMovieOutputSpec({
        aspectRatio: "9:16",
        qualityMode: "fast",
      }),
    ).toMatchObject({ width: 720, height: 1280 });
  });

  it("allows ultra 4K when permitted and clamps when not", () => {
    expect(
      resolveMovieOutputSpec({
        aspectRatio: "16:9",
        qualityMode: "ultra",
        allowUltra: true,
      }),
    ).toMatchObject({
      width: 3840,
      height: 2160,
      crf: 15,
      x264Preset: "slow",
      maxrate: "45M",
    });

    expect(
      resolveMovieOutputSpec({
        aspectRatio: "16:9",
        qualityMode: "ultra",
        allowUltra: false,
      }),
    ).toMatchObject({ width: 1920, height: 1080, crf: 15 });
  });
});

describe("scaleThemeFontSize", () => {
  it("scales titles up for taller exports", () => {
    expect(scaleThemeFontSize(42, 720)).toBe(42);
    expect(scaleThemeFontSize(42, 1080)).toBeGreaterThan(42);
    expect(scaleThemeFontSize(42, 2160)).toBeGreaterThan(
      scaleThemeFontSize(42, 1080),
    );
  });
});

describe("buildEncodeVideoFilter", () => {
  it("locks exact frame size with lanczos, SAR 1, and optional fps filter", () => {
    const vf = buildEncodeVideoFilter(1920, 1080, 30);
    expect(vf).toContain("1920:1080");
    expect(vf).toContain("flags=lanczos");
    expect(vf).toContain("setsar=1");
    expect(vf).toContain("format=yuv420p");
    expect(vf).toContain("fps=30");
    expect(vf).not.toContain("-r");
    expect(buildEncodeVideoFilter(1080, 1920)).toContain("setsar=1");
  });
});

describe("buildLibx264EncodeArgs", () => {
  it("emits Rec.709 tags, VBV ceiling, and faststart", () => {
    const spec = resolveMovieOutputSpec({
      aspectRatio: "16:9",
      qualityMode: "standard",
    });
    const args = buildLibx264EncodeArgs(spec);
    expect(args).toContain("libx264");
    expect(args).toContain("slow");
    expect(args).toContain("15");
    expect(args).toContain("bt709");
    expect(args).toContain("14M");
    expect(args).toContain("+faststart");
  });
});
