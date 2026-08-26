import { describe, expect, it, afterEach } from "vitest";
import sharp from "sharp";
import {
  adaptPortraitSourceForLandscape,
  decidePortraitLandscapeAdaptation,
  extendPortraitWithBlurFill,
  isPortraitForLandscapeTarget,
  portraitPlaceLeft,
  registerPortraitOutpaintProvider,
  remapFramingToExtendedCanvas,
} from "@/lib/movies/portrait-landscape";
import { computeFramingFromFaces, centerFraming } from "@/lib/movies/framing";

async function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 90, g: 120, b: 160 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe("portrait landscape detection", () => {
  it("detects portrait vs landscape target", () => {
    expect(isPortraitForLandscapeTarget(1000, 1600, 1920, 1080)).toBe(true);
    expect(isPortraitForLandscapeTarget(4000, 3000, 1920, 1080)).toBe(false);
  });

  it("extends when faces would be clipped by cover crop", () => {
    const framing = computeFramingFromFaces([
      { x: 0.2, y: 0.05, width: 0.55, height: 0.7 },
    ]);
    const decision = decidePortraitLandscapeAdaptation({
      sourceWidth: 1200,
      sourceHeight: 2000,
      targetWidth: 1920,
      targetHeight: 1080,
      framing,
    });
    expect(decision.shouldExtend).toBe(true);
    expect(decision.reason).toBe("extreme_subject_crop");
  });

  it("keeps smart crop when subject fits the cover window", () => {
    const framing = computeFramingFromFaces([
      { x: 0.35, y: 0.28, width: 0.25, height: 0.22 },
    ]);
    const decision = decidePortraitLandscapeAdaptation({
      sourceWidth: 1200,
      sourceHeight: 1600,
      targetWidth: 1920,
      targetHeight: 1080,
      framing,
    });
    expect(decision.shouldExtend).toBe(false);
    expect(decision.reason).toBe("subject_fits_cover");
  });

  it("extends very tall portraits without faces when crop is heavy", () => {
    const decision = decidePortraitLandscapeAdaptation({
      sourceWidth: 800,
      sourceHeight: 1600,
      targetWidth: 1920,
      targetHeight: 1080,
      framing: centerFraming(),
    });
    expect(decision.shouldExtend).toBe(true);
    expect(decision.reason).toBe("tall_portrait_heavy_crop");
  });
});

describe("portrait place + framing remap", () => {
  it("biases placement toward face focal", () => {
    const framing = computeFramingFromFaces([
      { x: 0.55, y: 0.2, width: 0.3, height: 0.35 },
    ]);
    const left = portraitPlaceLeft({
      sourceWidth: 1000,
      canvasWidth: 1778,
      framing,
    });
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(778);
  });

  it("remaps focal into the extended canvas", () => {
    const framing = computeFramingFromFaces([
      { x: 0.5, y: 0.25, width: 0.3, height: 0.35 },
    ]);
    const remapped = remapFramingToExtendedCanvas({
      framing,
      sourceWidth: 1000,
      sourceHeight: 1600,
      canvasWidth: 2844,
      canvasHeight: 1600,
      placeLeft: 922,
      placeTop: 0,
    });
    expect(remapped.focalPointX).toBeGreaterThan(0.4);
    expect(remapped.focalPointX).toBeLessThan(0.7);
    expect(remapped.subjectBounds).not.toBeNull();
    expect(remapped.subjectBounds!.width).toBeLessThan(
      framing.subjectBounds!.width,
    );
  });
});

describe("blur fill + adapt", () => {
  afterEach(() => {
    registerPortraitOutpaintProvider(null);
  });

  it("builds a landscape canvas without letterbox bars", async () => {
    const oriented = await solidJpeg(900, 1600);
    const out = await extendPortraitWithBlurFill({
      oriented,
      sourceWidth: 900,
      sourceHeight: 1600,
      canvasWidth: 2844,
      canvasHeight: 1600,
      placeLeft: 972,
      placeTop: 0,
      framing: centerFraming(),
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(2844);
    expect(meta.height).toBe(1600);
    expect((meta.width ?? 0) / (meta.height ?? 1)).toBeCloseTo(16 / 9, 1);
  });

  it("adapts extreme portraits and remaps framing", async () => {
    const oriented = await solidJpeg(1000, 1800);
    const framing = computeFramingFromFaces([
      { x: 0.15, y: 0.08, width: 0.7, height: 0.75 },
    ]);
    const result = await adaptPortraitSourceForLandscape({
      oriented,
      sourceWidth: 1000,
      sourceHeight: 1800,
      outputWidth: 1920,
      outputHeight: 1080,
      framing,
      mediaId: "p1",
    });
    expect(result.adapted).toBe(true);
    expect(result.method).toBe("blur_fill");
    expect(result.width / result.height).toBeCloseTo(16 / 9, 1);
    expect(result.framing.focalPointX).toBeGreaterThan(0.2);
    expect(result.framing.focalPointX).toBeLessThan(0.8);
  });

  it("falls back to smart crop when not needed", async () => {
    const oriented = await solidJpeg(4000, 3000);
    const result = await adaptPortraitSourceForLandscape({
      oriented,
      sourceWidth: 4000,
      sourceHeight: 3000,
      outputWidth: 1920,
      outputHeight: 1080,
      framing: centerFraming(),
    });
    expect(result.adapted).toBe(false);
    expect(result.method).toBe("smart_crop");
    expect(result.buffer).toBe(oriented);
  });

  it("uses AI provider when registered, else blur fill", async () => {
    const oriented = await solidJpeg(900, 1600);
    const framing = computeFramingFromFaces([
      { x: 0.2, y: 0.1, width: 0.6, height: 0.7 },
    ]);
    const fakeCanvas = await solidJpeg(2844, 1600);
    registerPortraitOutpaintProvider({
      name: "test-ai",
      extend: async () => fakeCanvas,
    });
    const result = await adaptPortraitSourceForLandscape({
      oriented,
      sourceWidth: 900,
      sourceHeight: 1600,
      outputWidth: 1920,
      outputHeight: 1080,
      framing,
    });
    expect(result.adapted).toBe(true);
    expect(result.method).toBe("ai_outpaint");
  });
});
