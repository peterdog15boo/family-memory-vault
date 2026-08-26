import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  buildMovieUpscaleCacheKey,
  fingerprintMovieUpscaleSource,
  maybeUpscaleMovieSource,
  MOVIE_UPSCALE_MIN_COVER_SCALE,
  planMovieSourceUpscale,
  upscaleWithSharp,
} from "@/lib/movies/upscale";

async function solidJpeg(
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 90, b: 160 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("planMovieSourceUpscale", () => {
  it("skips when the source already fills 1080p with headroom", () => {
    const plan = planMovieSourceUpscale({
      sourceWidth: 4000,
      sourceHeight: 3000,
      outputWidth: 1920,
      outputHeight: 1080,
    });
    expect(plan.needed).toBe(false);
    expect(plan.coverScale).toBeGreaterThanOrEqual(MOVIE_UPSCALE_MIN_COVER_SCALE);
  });

  it("plans an upscale for a small landscape still", () => {
    const plan = planMovieSourceUpscale({
      sourceWidth: 800,
      sourceHeight: 600,
      outputWidth: 1920,
      outputHeight: 1080,
    });
    expect(plan.needed).toBe(true);
    expect(plan.coverScale).toBeLessThan(1);
    expect(plan.targetWidth).toBeGreaterThan(800);
    expect(plan.targetHeight).toBeGreaterThan(600);
    expect(plan.scaleFactor).toBeGreaterThan(1.05);
  });

  it("plans an upscale for a small portrait filling landscape", () => {
    const plan = planMovieSourceUpscale({
      sourceWidth: 480,
      sourceHeight: 640,
      outputWidth: 1920,
      outputHeight: 1080,
    });
    expect(plan.needed).toBe(true);
    expect(plan.targetWidth).toBeGreaterThan(480);
  });

  it("caps target long-edge for tiny thumbs", () => {
    const plan = planMovieSourceUpscale({
      sourceWidth: 120,
      sourceHeight: 90,
      outputWidth: 1920,
      outputHeight: 1080,
      maxLongEdge: 2048,
    });
    expect(plan.needed).toBe(true);
    expect(Math.max(plan.targetWidth, plan.targetHeight)).toBeLessThanOrEqual(
      2048,
    );
  });
});

describe("upscaleWithSharp", () => {
  it("enlarges a small buffer to the target size", async () => {
    const src = await solidJpeg(200, 150);
    const out = await upscaleWithSharp(src, 800, 600);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });
});

describe("maybeUpscaleMovieSource", () => {
  it("returns the original when upscale is not needed", async () => {
    const oriented = await solidJpeg(3000, 2000);
    const result = await maybeUpscaleMovieSource({
      oriented,
      sourceWidth: 3000,
      sourceHeight: 2000,
      outputWidth: 1920,
      outputHeight: 1080,
      skipRemoteCache: true,
    });
    expect(result.applied).toBe(false);
    expect(result.method).toBe("none");
    expect(result.buffer).toBe(oriented);
  });

  it("upscales a soft source and completes without throwing", async () => {
    const oriented = await solidJpeg(640, 480);
    const result = await maybeUpscaleMovieSource({
      oriented,
      sourceWidth: 640,
      sourceHeight: 480,
      outputWidth: 1920,
      outputHeight: 1080,
      skipRemoteCache: true,
      mediaId: "test-media",
    });
    expect(result.applied).toBe(true);
    expect(["sharp", "cache"]).toContain(result.method);
    expect(result.width).toBeGreaterThan(640);
    expect(result.height).toBeGreaterThan(480);
  });

  it("falls back to the original when sharp upscale fails", async () => {
    const broken = Buffer.from("not-an-image");
    const result = await maybeUpscaleMovieSource({
      oriented: broken,
      sourceWidth: 400,
      sourceHeight: 300,
      outputWidth: 1920,
      outputHeight: 1080,
      skipRemoteCache: true,
    });
    expect(result.applied).toBe(false);
    expect(result.buffer).toBe(broken);
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });
});

describe("upscale cache keys", () => {
  it("builds a stable processed/ key from fingerprint", () => {
    const fp = fingerprintMovieUpscaleSource({
      buffer: Buffer.from("abc"),
      targetWidth: 1920,
      targetHeight: 1080,
    });
    expect(fp).toHaveLength(40);
    expect(buildMovieUpscaleCacheKey(fp)).toMatch(
      /^processed\/movie-upscale\/v2-[a-f0-9]+\.jpg$/,
    );
  });
});
