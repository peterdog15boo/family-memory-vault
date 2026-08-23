import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { PlanFeatures } from "@/lib/db/schema";
import {
  buildBrandWatermarkFfmpegArgs,
  buildBrandWatermarkOverlay,
  MOVIE_WATERMARK_LABEL,
  shouldApplyMovieWatermark,
} from "@/lib/movies/watermark";

describe("shouldApplyMovieWatermark", () => {
  it("always applies on Free", () => {
    expect(
      shouldApplyMovieWatermark("free", {
        removeMovieWatermark: true,
      } as PlanFeatures),
    ).toBe(true);
    expect(shouldApplyMovieWatermark("free", {} as PlanFeatures)).toBe(true);
  });

  it("skips paid plans that remove the watermark", () => {
    expect(
      shouldApplyMovieWatermark("family", {
        removeMovieWatermark: true,
      } as PlanFeatures),
    ).toBe(false);
    expect(
      shouldApplyMovieWatermark("legacy", {
        removeMovieWatermark: true,
      } as PlanFeatures),
    ).toBe(false);
    // Older DB rows may omit the flag — known paid slugs still skip.
    expect(shouldApplyMovieWatermark("family", {} as PlanFeatures)).toBe(false);
    expect(shouldApplyMovieWatermark("family_plus", {} as PlanFeatures)).toBe(
      false,
    );
  });

  it("applies on unknown plans unless explicitly removed", () => {
    expect(shouldApplyMovieWatermark("custom", {} as PlanFeatures)).toBe(true);
    expect(
      shouldApplyMovieWatermark("custom", {
        removeMovieWatermark: true,
      } as PlanFeatures),
    ).toBe(false);
  });
});

describe("buildBrandWatermarkOverlay", () => {
  it("renders a bottom overlay with readable pixels", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "fmv-wm-unit-"));
    const overlay = await buildBrandWatermarkOverlay({
      workDir,
      width: 1920,
      height: 1080,
    });
    expect(overlay.path).toContain("brand-watermark.png");
    expect(overlay.width).toBeGreaterThan(200);
    expect(overlay.height).toBeGreaterThan(20);
    expect(overlay.margin).toBeGreaterThan(10);

    const meta = await sharp(overlay.path).metadata();
    expect(meta.width).toBe(overlay.width);
    expect(meta.hasAlpha).toBe(true);
    const stats = await sharp(overlay.path).stats();
    // Must not be a fully transparent / empty image.
    expect(stats.channels[3]!.mean).toBeGreaterThan(20);
  });
});

describe("buildBrandWatermarkFfmpegArgs", () => {
  it("maps filtered video and optional audio with bottom-center overlay", () => {
    const args = buildBrandWatermarkFfmpegArgs({
      videoPath: "in.mp4",
      overlayPath: "wm.png",
      outputPath: "out.mp4",
      margin: 24,
      x264Preset: "medium",
      crf: 16,
    });
    expect(args).toContain("-filter_complex");
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("overlay=(W-w)/2:H-h-24");
    expect(args).toContain("-map");
    expect(args).toContain("[v]");
    expect(args).toContain("0:a?");
    expect(args).toContain("libx264");
    expect(args.at(-1)).toBe("out.mp4");
    expect(MOVIE_WATERMARK_LABEL).toMatch(/Family Memory Vault/);
  });
});
