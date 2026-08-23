import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { PlanFeatures } from "@/lib/db/schema";
import {
  MOVIE_WATERMARK_LABEL,
  shouldApplyMovieWatermark,
} from "@/lib/movies/watermark-policy";
import {
  buildBrandWatermarkFfmpegArgs,
  buildBrandWatermarkOverlay,
  resolveWatermarkFontPath,
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
  it("renders a transparent left-bottom mark without a pill background", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "fmv-wm-unit-"));
    expect(resolveWatermarkFontPath()).toBeTruthy();

    const overlay = await buildBrandWatermarkOverlay({
      workDir,
      width: 1920,
      height: 1080,
    });
    expect(overlay.path).toContain("brand-watermark.png");
    expect(overlay.height).toBeGreaterThanOrEqual(36);
    expect(overlay.width).toBeGreaterThan(300);
    expect(overlay.margin).toBeGreaterThan(10);
    expect(overlay.leftMargin).toBeGreaterThan(10);
    expect(overlay.hasLogo).toBe(true);

    const meta = await sharp(overlay.path).metadata();
    expect(meta.width).toBe(overlay.width);
    expect(meta.hasAlpha).toBe(true);
    const { data, info } = await sharp(overlay.path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Corner pixel should be fully transparent (no pill).
    expect(data[3]).toBe(0);
    // Some pixels must carry content.
    let opaque = 0;
    for (let i = 3; i < data.length; i += info.channels) {
      if (data[i]! > 8) opaque += 1;
    }
    expect(opaque).toBeGreaterThan(100);
  });
});

describe("buildBrandWatermarkFfmpegArgs", () => {
  it("maps filtered video and optional audio with bottom-left overlay", () => {
    const args = buildBrandWatermarkFfmpegArgs({
      videoPath: "in.mp4",
      overlayPath: "wm.png",
      outputPath: "out.mp4",
      margin: 24,
      leftMargin: 32,
      x264Preset: "medium",
      crf: 16,
    });
    expect(args).toContain("-filter_complex");
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("overlay=32:H-h-24");
    expect(fc).not.toContain("(W-w)/2");
    expect(args).toContain("-map");
    expect(args).toContain("[v]");
    expect(args).toContain("0:a?");
    expect(args).toContain("libx264");
    expect(args.at(-1)).toBe("out.mp4");
    expect(MOVIE_WATERMARK_LABEL).toMatch(/Family Memory Vault/);
  });
});
