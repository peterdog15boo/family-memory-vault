/**
 * Portrait → landscape adaptation for movie stills.
 *
 * Default for all sources: fill-frame cover crop (no letterbox).
 * When a tall portrait would require an extreme crop that clips faces /
 * subject, we optionally widen the canvas with a practical side fill
 * (blurred cover backdrop + face-aware placement). That yields a true
 * landscape buffer Ken Burns can use without pillarboxing.
 *
 * AI outpainting is an optional provider hook — not required for Simple Mode.
 */

import sharp from "sharp";
import {
  baseCoverSize,
  centerFraming,
  type MediaFraming,
  type MediaSubjectBounds,
} from "@/lib/movies/framing";

/** How aggressive the damage check is (0–1 subject height vs cover crop). */
export const PORTRAIT_EXTREME_SUBJECT_FIT = 0.98;

/** Source must be clearly taller than the target aspect to count as portrait. */
export const PORTRAIT_ASPECT_SLACK = 0.98;

export function isPortraitForLandscapeTarget(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): boolean {
  const sw = Math.max(1, sourceWidth);
  const sh = Math.max(1, sourceHeight);
  const targetAspect = targetWidth / Math.max(1, targetHeight);
  const sourceAspect = sw / sh;
  // True portrait (taller than wide) that is also taller than the export aspect
  // → cover crop is width-limited and will trim top/bottom.
  return sourceAspect < 1 && sourceAspect < targetAspect * PORTRAIT_ASPECT_SLACK;
}

export type PortraitLandscapeDecision = {
  shouldExtend: boolean;
  reason:
    | "not_portrait"
    | "subject_fits_cover"
    | "extreme_subject_crop"
    | "tall_portrait_heavy_crop"
    | "disabled";
  sourceAspect: number;
  targetAspect: number;
  croppedHeightFraction: number;
};

export type PortraitOutpaintInput = {
  oriented: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Where the original sits on the canvas (px). */
  placeLeft: number;
  placeTop: number;
  framing: MediaFraming;
};

/**
 * Optional AI / service outpaint. Return a landscape JPEG/PNG buffer covering
 * canvasWidth×canvasHeight, or null to fall back to the built-in blur fill.
 */
export type PortraitOutpaintProvider = {
  name: string;
  extend(input: PortraitOutpaintInput): Promise<Buffer | null>;
};

let outpaintProvider: PortraitOutpaintProvider | null = null;

/** Register (or clear) an AI outpaint provider — extension point for later. */
export function registerPortraitOutpaintProvider(
  provider: PortraitOutpaintProvider | null,
): void {
  outpaintProvider = provider;
}

export function getPortraitOutpaintProvider(): PortraitOutpaintProvider | null {
  return outpaintProvider;
}

/**
 * Decide whether cover-cropping this portrait into the landscape canvas would
 * damage the subject enough to prefer width extension instead.
 */
export function decidePortraitLandscapeAdaptation(input: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  framing?: MediaFraming | null;
  /** Force off (tests / emergency). */
  disabled?: boolean;
}): PortraitLandscapeDecision {
  const sw = Math.max(1, input.sourceWidth);
  const sh = Math.max(1, input.sourceHeight);
  const tw = Math.max(1, input.targetWidth);
  const th = Math.max(1, input.targetHeight);
  const sourceAspect = sw / sh;
  const targetAspect = tw / th;
  const base = baseCoverSize(sw, sh, tw, th);
  const croppedHeightFraction = Math.max(0, 1 - base.height / sh);

  if (input.disabled) {
    return {
      shouldExtend: false,
      reason: "disabled",
      sourceAspect,
      targetAspect,
      croppedHeightFraction,
    };
  }

  if (!isPortraitForLandscapeTarget(sw, sh, tw, th)) {
    return {
      shouldExtend: false,
      reason: "not_portrait",
      sourceAspect,
      targetAspect,
      croppedHeightFraction,
    };
  }

  const subject = input.framing?.subjectBounds;
  if (subject && subject.height > 0) {
    const subjectH = subject.height * sh;
    const subjectW = subject.width * sw;
    // Face/group taller or wider than the cover window → extend instead of chop.
    if (
      subjectH > base.height * PORTRAIT_EXTREME_SUBJECT_FIT ||
      subjectW > base.width * PORTRAIT_EXTREME_SUBJECT_FIT
    ) {
      return {
        shouldExtend: true,
        reason: "extreme_subject_crop",
        sourceAspect,
        targetAspect,
        croppedHeightFraction,
      };
    }
    // Large subject + meaningful vertical crop even if it "barely fits".
    if (subject.height >= 0.48 && croppedHeightFraction >= 0.18) {
      return {
        shouldExtend: true,
        reason: "extreme_subject_crop",
        sourceAspect,
        targetAspect,
        croppedHeightFraction,
      };
    }
    return {
      shouldExtend: false,
      reason: "subject_fits_cover",
      sourceAspect,
      targetAspect,
      croppedHeightFraction,
    };
  }

  // No faces: still extend very tall portraits that lose a lot of height.
  if (sourceAspect <= 0.72 && croppedHeightFraction >= 0.28) {
    return {
      shouldExtend: true,
      reason: "tall_portrait_heavy_crop",
      sourceAspect,
      targetAspect,
      croppedHeightFraction,
    };
  }

  return {
    shouldExtend: false,
    reason: "subject_fits_cover",
    sourceAspect,
    targetAspect,
    croppedHeightFraction,
  };
}

/**
 * Horizontal placement of the portrait on the widened canvas.
 * Biases so the face focal sits near the horizontal center of the landscape.
 */
export function portraitPlaceLeft(input: {
  sourceWidth: number;
  canvasWidth: number;
  framing?: MediaFraming | null;
}): number {
  const gap = Math.max(0, input.canvasWidth - input.sourceWidth);
  if (gap <= 0) return 0;
  const framing = input.framing ?? centerFraming();
  // Ideal: focal maps to canvas center ⇒ placeLeft + focalX*sw = canvasW/2
  const ideal =
    input.canvasWidth / 2 - framing.focalPointX * input.sourceWidth;
  return Math.min(gap, Math.max(0, ideal));
}

/**
 * Remap normalized framing from the original photo onto the extended canvas.
 */
export function remapFramingToExtendedCanvas(input: {
  framing: MediaFraming;
  sourceWidth: number;
  sourceHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  placeLeft: number;
  placeTop: number;
}): MediaFraming {
  const { framing, sourceWidth, sourceHeight, canvasWidth, canvasHeight } =
    input;
  const sw = Math.max(1, sourceWidth);
  const sh = Math.max(1, sourceHeight);
  const cw = Math.max(1, canvasWidth);
  const ch = Math.max(1, canvasHeight);

  const mapX = (nx: number) => (input.placeLeft + nx * sw) / cw;
  const mapY = (ny: number) => (input.placeTop + ny * sh) / ch;
  const mapW = (nw: number) => (nw * sw) / cw;
  const mapH = (nh: number) => (nh * sh) / ch;

  let subjectBounds: MediaSubjectBounds | null = null;
  if (framing.subjectBounds) {
    const s = framing.subjectBounds;
    subjectBounds = {
      ...s,
      x: Math.min(1, Math.max(0, mapX(s.x))),
      y: Math.min(1, Math.max(0, mapY(s.y))),
      width: Math.min(1, Math.max(0, mapW(s.width))),
      height: Math.min(1, Math.max(0, mapH(s.height))),
    };
  }

  return {
    ...framing,
    focalPointX: Math.min(1, Math.max(0, mapX(framing.focalPointX))),
    focalPointY: Math.min(1, Math.max(0, mapY(framing.focalPointY))),
    subjectBounds,
    // Extended canvas is already landscape-matched — mild zoom is safe again.
    maxZoomAmount:
      framing.maxZoomAmount == null
        ? null
        : Math.max(framing.maxZoomAmount, 0.08),
  };
}

/**
 * Practical side fill: blurred cover of the portrait as backdrop, original
 * composited face-aware on top. No letterbox bars — full-bleed landscape.
 */
export async function extendPortraitWithBlurFill(
  input: PortraitOutpaintInput,
): Promise<Buffer> {
  const {
    oriented,
    canvasWidth,
    canvasHeight,
    placeLeft,
    placeTop,
  } = input;

  const backdrop = await sharp(oriented)
    .resize(canvasWidth, canvasHeight, {
      fit: "cover",
      position: "centre",
      kernel: "lanczos3",
    })
    .blur(48)
    .modulate({ saturation: 0.92, brightness: 0.92 })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const foreground = await sharp(oriented).ensureAlpha().png().toBuffer();

  return sharp(backdrop)
    .composite([
      {
        input: foreground,
        left: Math.round(placeLeft),
        top: Math.round(placeTop),
      },
    ])
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}

export type AdaptPortraitResult = {
  buffer: Buffer;
  width: number;
  height: number;
  framing: MediaFraming;
  adapted: boolean;
  method: "none" | "blur_fill" | "ai_outpaint" | "smart_crop";
  decision: PortraitLandscapeDecision;
};

/**
 * Adapt a portrait still for landscape movies when extreme crop would hurt.
 * On any failure → return original (smart face-aware cover path continues).
 */
export async function adaptPortraitSourceForLandscape(input: {
  oriented: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  framing: MediaFraming;
  mediaId?: string;
  disabled?: boolean;
}): Promise<AdaptPortraitResult> {
  const decision = decidePortraitLandscapeAdaptation({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    targetWidth: input.outputWidth,
    targetHeight: input.outputHeight,
    framing: input.framing,
    disabled: input.disabled,
  });

  if (!decision.shouldExtend) {
    return {
      buffer: input.oriented,
      width: input.sourceWidth,
      height: input.sourceHeight,
      framing: input.framing,
      adapted: false,
      method: "smart_crop",
      decision,
    };
  }

  const targetAspect =
    input.outputWidth / Math.max(1, input.outputHeight);
  // Keep full portrait height; widen to landscape aspect (fill-frame canvas).
  const canvasHeight = input.sourceHeight;
  const canvasWidth = Math.max(
    input.sourceWidth,
    Math.round(canvasHeight * targetAspect),
  );
  const placeLeft = portraitPlaceLeft({
    sourceWidth: input.sourceWidth,
    canvasWidth,
    framing: input.framing,
  });
  const placeTop = 0;

  const outpaintInput: PortraitOutpaintInput = {
    oriented: input.oriented,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    canvasWidth,
    canvasHeight,
    placeLeft,
    placeTop,
    framing: input.framing,
  };

  try {
    let buffer: Buffer | null = null;
    let method: AdaptPortraitResult["method"] = "blur_fill";

    const provider = getPortraitOutpaintProvider();
    if (provider) {
      try {
        buffer = await provider.extend(outpaintInput);
        if (buffer) method = "ai_outpaint";
      } catch (err) {
        console.warn(
          "[movies.portrait] AI outpaint failed — using blur fill",
          {
            mediaId: input.mediaId,
            provider: provider.name,
            err: err instanceof Error ? err.message : String(err),
          },
        );
        buffer = null;
      }
    }

    if (!buffer) {
      buffer = await extendPortraitWithBlurFill(outpaintInput);
      method = "blur_fill";
    }

    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? canvasWidth;
    const height = meta.height ?? canvasHeight;
    const framing = remapFramingToExtendedCanvas({
      framing: input.framing,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      canvasWidth: width,
      canvasHeight: height,
      placeLeft,
      placeTop,
    });

    console.info("[movies.portrait] Extended portrait to landscape canvas", {
      mediaId: input.mediaId,
      reason: decision.reason,
      method,
      from: `${input.sourceWidth}x${input.sourceHeight}`,
      to: `${width}x${height}`,
      placeLeft: Math.round(placeLeft),
    });

    return {
      buffer,
      width,
      height,
      framing,
      adapted: true,
      method,
      decision,
    };
  } catch (err) {
    console.warn(
      "[movies.portrait] Extension failed — smart cover crop fallback",
      {
        mediaId: input.mediaId,
        err: err instanceof Error ? err.message : String(err),
      },
    );
    return {
      buffer: input.oriented,
      width: input.sourceWidth,
      height: input.sourceHeight,
      framing: input.framing,
      adapted: false,
      method: "smart_crop",
      decision,
    };
  }
}
