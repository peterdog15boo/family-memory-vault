import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MOVIE_TRANSITIONS } from "@/lib/movies/settings";
import {
  getTransitionCatalogEntry,
  renderTransitionFrames,
  resolveTransitionDurationMs,
  TRANSITION_CATALOG,
  transitionOverlapMs,
  transitionSampleCount,
  transitionSampleProgress,
  trimFrameDurationsFromEnd,
  trimSampleHoldsFromStart,
  warpFadeThroughProgress,
} from "@/lib/movies/transitions";

async function solidJpeg(
  r: number,
  g: number,
  b: number,
  width = 64,
  height = 36,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r, g, b },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("TRANSITION_CATALOG", () => {
  it("covers every MovieTransition id", () => {
    const ids = new Set(TRANSITION_CATALOG.map((e) => e.id));
    for (const id of MOVIE_TRANSITIONS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("lists fade through black and white", () => {
    expect(getTransitionCatalogEntry("fade").label).toMatch(/black/i);
    expect(getTransitionCatalogEntry("fade_white").label).toMatch(/white/i);
  });
});

describe("resolveTransitionDurationMs", () => {
  it("returns 0 for hard cut", () => {
    expect(
      resolveTransitionDurationMs({
        style: "none",
        themeDurationMs: 600,
        clipDurationMs: 3000,
      }),
    ).toBe(0);
  });

  it("honors user override when set", () => {
    expect(
      resolveTransitionDurationMs({
        style: "crossfade",
        themeDurationMs: 400,
        clipDurationMs: 5000,
        overrideMs: 900,
      }),
    ).toBe(900);
  });

  it("keeps soft_cut brief", () => {
    const ms = resolveTransitionDurationMs({
      style: "soft_cut",
      themeDurationMs: 900,
      clipDurationMs: 5000,
      overrideMs: 900,
    });
    expect(ms).toBeGreaterThanOrEqual(160);
    expect(ms).toBeLessThanOrEqual(320);
  });

  it("falls back to catalog default when theme duration is 0", () => {
    const catalog = getTransitionCatalogEntry("zoom_through");
    const ms = resolveTransitionDurationMs({
      style: "zoom_through",
      themeDurationMs: 0,
      clipDurationMs: 8000,
    });
    expect(ms).toBe(catalog.defaultDurationMs);
  });
});

describe("transition timing helpers", () => {
  it("uses exclusive-endpoint progress to avoid junction stutter", () => {
    const n = 10;
    expect(transitionSampleProgress(0, n)).toBeGreaterThan(0);
    expect(transitionSampleProgress(n - 1, n)).toBeLessThan(1);
    expect(transitionSampleProgress(0, n)).toBeLessThan(
      transitionSampleProgress(1, n),
    );
  });

  it("splits overlap evenly across adjacent clips", () => {
    expect(transitionOverlapMs(600)).toBe(300);
    expect(transitionOverlapMs(0)).toBe(0);
  });

  it("trims hold ms from the end of a clip frame list", () => {
    const frames = [
      { durationMs: 100, kind: "photo" },
      { durationMs: 200, kind: "photo" },
      { durationMs: 300, kind: "photo" },
    ];
    const trimmed = trimFrameDurationsFromEnd(frames, 0, 250);
    expect(trimmed).toBe(250);
    expect(frames.reduce((s, f) => s + f.durationMs, 0)).toBe(350);
  });

  it("trims hold ms from the start of incoming samples", () => {
    const samples = [{ holdMs: 100 }, { holdMs: 100 }, { holdMs: 100 }];
    const trimmed = trimSampleHoldsFromStart(samples, 150);
    expect(trimmed).toBe(150);
    expect(samples.reduce((s, x) => s + x.holdMs, 0)).toBe(150);
  });

  it("warps fade progress toward a solid mid dip", () => {
    expect(warpFadeThroughProgress(0.5)).toBeCloseTo(0.5, 5);
    expect(Math.abs(warpFadeThroughProgress(0.4) - 0.5)).toBeLessThan(0.12);
  });
});

describe("transitionSampleCount", () => {
  it("tracks encode fps for smooth exports", () => {
    const count = transitionSampleCount("crossfade", 600, { fps: 30 });
    // Dissolves oversample 2× encode fps (0.6s × 60 = 36).
    expect(count).toBeGreaterThanOrEqual(24);
    expect(count).toBeLessThanOrEqual(60);
  });

  it("uses fewer samples in fast mode", () => {
    const full = transitionSampleCount("crossfade", 600, { fps: 30 });
    const fast = transitionSampleCount("crossfade", 600, {
      fps: 30,
      fast: true,
    });
    expect(fast).toBeLessThan(full);
    expect(fast).toBeGreaterThanOrEqual(6);
  });
});

describe("renderTransitionFrames", () => {
  it("renders zero frames for none", async () => {
    const from = await solidJpeg(20, 20, 20);
    const to = await solidJpeg(200, 200, 200);
    const frames = await renderTransitionFrames({
      style: "none",
      fromJpeg: from,
      toJpeg: to,
      durationMs: 500,
      width: 64,
      height: 36,
      background: { r: 0, g: 0, b: 0 },
      fps: 30,
    });
    expect(frames).toHaveLength(0);
  });

  it("bakes multiple frames for each styled transition", async () => {
    const from = await solidJpeg(10, 10, 40);
    const to = await solidJpeg(220, 180, 40);
    const styles = MOVIE_TRANSITIONS.filter((s) => s !== "none");

    for (const style of styles) {
      const frames = await renderTransitionFrames({
        style,
        fromJpeg: from,
        toJpeg: to,
        durationMs: style === "soft_cut" ? 220 : 400,
        width: 64,
        height: 36,
        background: { r: 12, g: 12, b: 16 },
        fps: 24,
        jpegQuality: 90,
      });
      expect(frames.length, style).toBeGreaterThanOrEqual(4);
      const totalMs = frames.reduce((s, f) => s + f.durationMs, 0);
      expect(totalMs, style).toBe(style === "soft_cut" ? 220 : 400);
      for (const frame of frames) {
        expect(frame.jpeg.byteLength).toBeGreaterThan(100);
      }
    }
  }, 60_000);

  it("fade through black reaches a near-black mid frame", async () => {
    const from = await solidJpeg(240, 240, 240);
    const to = await solidJpeg(240, 200, 180);
    const frames = await renderTransitionFrames({
      style: "fade",
      fromJpeg: from,
      toJpeg: to,
      durationMs: 600,
      width: 48,
      height: 27,
      background: { r: 0, g: 0, b: 0 },
      fps: 30,
      jpegQuality: 95,
    });
    const mid = frames[Math.floor(frames.length / 2)]!;
    const { data, info } = await sharp(mid.jpeg)
      .raw()
      .toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i]!;
    const mean = sum / data.length;
    expect(info.channels).toBeGreaterThanOrEqual(3);
    expect(mean).toBeLessThan(40);
  }, 30_000);

  it("accepts per-sample moving from/to JPEGs", async () => {
    const count = transitionSampleCount("crossfade", 400, { fps: 24 });
    const fromJpegs = await Promise.all(
      Array.from({ length: count }, (_, i) => {
        const v = Math.round(20 + (i / Math.max(1, count - 1)) * 40);
        return solidJpeg(v, v, v + 10);
      }),
    );
    const toJpegs = await Promise.all(
      Array.from({ length: count }, (_, i) => {
        const v = Math.round(200 - (i / Math.max(1, count - 1)) * 40);
        return solidJpeg(v, v - 10, v);
      }),
    );
    const frames = await renderTransitionFrames({
      style: "crossfade",
      fromJpegs,
      toJpegs,
      durationMs: 400,
      width: 64,
      height: 36,
      background: { r: 0, g: 0, b: 0 },
      fps: 24,
      jpegQuality: 90,
    });
    expect(frames).toHaveLength(count);
    expect(frames.reduce((s, f) => s + f.durationMs, 0)).toBe(400);
  });
});
