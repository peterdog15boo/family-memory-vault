/**
 * Face-aware Ken Burns framing.
 *
 * Computes a focal point + subject bounds from normalized face boxes, then
 * resolves source-image crop rectangles that keep heads in frame across zoom.
 */

import type { FaceBoundingBox } from "@/lib/people/types";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MediaSubjectBounds = NormalizedRect & {
  /** Number of faces used to build this region. */
  faceCount: number;
  /** Mean face area (normalized) — small ⇒ conservative zoom. */
  meanFaceArea: number;
  /** Stable signature so cache can invalidate when faces change. */
  signature: string;
};

export type MediaFraming = {
  /** Focal point in normalized image coords (0–1). */
  focalPointX: number;
  focalPointY: number;
  subjectBounds: MediaSubjectBounds | null;
  /** Cap on extra zoom (0 = no zoom). Null ⇒ use requested zoom as-is. */
  maxZoomAmount: number | null;
  source: "faces" | "center";
};

export type KenBurnsSourceCrop = {
  /**
   * Crop window in oriented source pixels. May be fractional — Sharp extract
   * is applied via sub-pixel covering extract + lanczos (see generator).
   */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Absolute scale used (≥ 1). */
  scale: number;
};

const MIN_FACE_AREA = 0.0008; // ignore tiny false positives
const SMALL_FACE_AREA = 0.012; // below this → conservative zoom
const GROUP_SPAN_WIDE = 0.62; // subject width/height fraction ⇒ soften zoom

/**
 * Soft max zoom from stored/computed subject bounds.
 * Shared by live `computeFramingFromFaces` and media-row cache reads so
 * quality/filter upgrades never reintroduce aggressive center zoom.
 */
export function resolveMaxZoomFromSubjectBounds(
  bounds: Pick<MediaSubjectBounds, "faceCount" | "meanFaceArea" | "width" | "height"> | null | undefined,
): number | null {
  if (!bounds || bounds.faceCount < 1) return null;
  const span = Math.max(bounds.width, bounds.height);
  // Soft caps still allow visible motion; single portraits stay uncapped (null).
  if (bounds.meanFaceArea < SMALL_FACE_AREA) return 0.1;
  if (span >= GROUP_SPAN_WIDE || bounds.faceCount >= 4) return 0.12;
  if (bounds.faceCount >= 2) return 0.16;
  return null;
}

/** Clamp to [0, 1]. */
export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function faceBoxArea(box: FaceBoundingBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

export function faceBoxSignature(boxes: FaceBoundingBox[]): string {
  if (boxes.length === 0) return "0";
  const parts = boxes
    .map(
      (b) =>
        `${b.x.toFixed(3)},${b.y.toFixed(3)},${b.width.toFixed(3)},${b.height.toFixed(3)}`,
    )
    .sort();
  return `${boxes.length}:${parts.join("|")}`;
}

/**
 * Expand a normalized face box with headroom (up) and side/body padding.
 * Never expands outside [0,1].
 */
export function expandFaceBox(
  box: FaceBoundingBox,
  opts?: { top?: number; side?: number; bottom?: number },
): NormalizedRect {
  // Moderate headroom — heavy pads inflated subjectBounds so capZoomToFitSubject
  // returned 0 and Ken Burns became a static hold (looked like “no face focus”).
  const topPad = opts?.top ?? 0.28;
  const sidePad = opts?.side ?? 0.16;
  const bottomPad = opts?.bottom ?? 0.3;

  const padX = box.width * sidePad;
  const padTop = box.height * topPad;
  const padBottom = box.height * bottomPad;

  const x = clamp01(box.x - padX);
  const y = clamp01(box.y - padTop);
  const right = clamp01(box.x + box.width + padX);
  const bottom = clamp01(box.y + box.height + padBottom);

  return {
    x,
    y,
    width: Math.max(0.001, right - x),
    height: Math.max(0.001, bottom - y),
  };
}

function unionRects(rects: NormalizedRect[]): NormalizedRect {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  minX = clamp01(minX);
  minY = clamp01(minY);
  maxX = clamp01(maxX);
  maxY = clamp01(maxY);
  return {
    x: minX,
    y: minY,
    width: Math.max(0.001, maxX - minX),
    height: Math.max(0.001, maxY - minY),
  };
}

/**
 * Build framing from detected faces (normalized boxes).
 * Falls back to center when empty / unusable.
 */
export function computeFramingFromFaces(
  boxes: FaceBoundingBox[],
): MediaFraming {
  const usable = boxes.filter((b) => faceBoxArea(b) >= MIN_FACE_AREA);
  if (usable.length === 0) {
    return centerFraming();
  }

  // Prefer larger faces when many detections (skip tiny background faces).
  const areas = usable.map(faceBoxArea);
  const maxArea = Math.max(...areas);
  const major = usable.filter((b, i) => areas[i]! >= maxArea * 0.28);

  const expanded = major.map((b) => expandFaceBox(b));
  const subject = unionRects(expanded);
  // Light group pad — keep faces dominant in frame for Ken Burns.
  const groupPad = major.length > 1 ? 0.03 : 0.012;
  const padded: NormalizedRect = {
    x: clamp01(subject.x - groupPad),
    y: clamp01(subject.y - groupPad * 0.5),
    width: 0,
    height: 0,
  };
  const right = clamp01(subject.x + subject.width + groupPad);
  const bottom = clamp01(subject.y + subject.height + groupPad * 1.1);
  padded.width = Math.max(0.001, right - padded.x);
  padded.height = Math.max(0.001, bottom - padded.y);

  // Bias focal toward upper face (eyes / hairline), not geometric center.
  const focalPointX = padded.x + padded.width / 2;
  const focalPointY = padded.y + padded.height * 0.36;

  const meanFaceArea =
    major.reduce((s, b) => s + faceBoxArea(b), 0) / major.length;

  const subjectBounds: MediaSubjectBounds = {
    ...padded,
    faceCount: major.length,
    meanFaceArea,
    signature: faceBoxSignature(major),
  };

  const maxZoomAmount = resolveMaxZoomFromSubjectBounds(subjectBounds);

  return {
    focalPointX: clamp01(focalPointX),
    focalPointY: clamp01(focalPointY),
    subjectBounds,
    maxZoomAmount,
    source: "faces",
  };
}

export function centerFraming(): MediaFraming {
  return {
    focalPointX: 0.5,
    focalPointY: 0.45, // slight upward bias even without faces
    subjectBounds: null,
    maxZoomAmount: null,
    source: "center",
  };
}

/**
 * Base cover crop size in source pixels for the target aspect (zoom = 1).
 * This is the largest Tw/Th window that fits inside the source.
 */
export function baseCoverSize(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { width: number; height: number } {
  const sw = Math.max(1, sourceWidth);
  const sh = Math.max(1, sourceHeight);
  const aspect = targetWidth / Math.max(1, targetHeight);
  const sourceAspect = sw / sh;

  if (sourceAspect > aspect) {
    // Source wider than frame — height-limited
    return { width: sh * aspect, height: sh };
  }
  // Source taller / equal — width-limited
  return { width: sw, height: sw / aspect };
}

/**
 * Axis clamp range for face-aware placement.
 *
 * When the subject fits in the crop, the range keeps the full subject inside.
 * When it does not, the range keeps maximum overlap (crop stays inside the
 * subject span). At the equality boundary both collapse to the same point, so
 * left/top stay continuous as Ken Burns scale crosses “fits ↔ overflow” —
 * avoiding the mid-zoom headshot jump from flipping strategies.
 */
function subjectAxisClampRange(
  subjectStart: number,
  subjectEnd: number,
  cropSize: number,
  sourceSize: number,
): { min: number; max: number } | null {
  const subjectSpan = subjectEnd - subjectStart;
  if (subjectSpan <= 0 || cropSize <= 0) return null;

  let min: number;
  let max: number;
  if (subjectSpan <= cropSize) {
    min = Math.max(0, subjectEnd - cropSize);
    max = Math.min(Math.max(0, sourceSize - cropSize), subjectStart);
  } else {
    min = Math.max(0, subjectStart);
    max = Math.min(Math.max(0, sourceSize - cropSize), subjectEnd - cropSize);
  }
  if (min > max) return null;
  return { min, max };
}

/**
 * Place a crop of size cropW×cropH so the face focal point stays as close to
 * the frame center as possible, while keeping subjectBounds (head margin)
 * inside the crop whenever the crop is large enough.
 *
 * Called for every Ken Burns sample via {@link sourceCropAtScale} — not only
 * the first frame.
 */
export function placeCropAroundFocal(input: {
  sourceWidth: number;
  sourceHeight: number;
  cropW: number;
  cropH: number;
  focalX: number;
  focalY: number;
  subject?: NormalizedRect | null;
}): { left: number; top: number } {
  const sw = Math.max(1, input.sourceWidth);
  const sh = Math.max(1, input.sourceHeight);
  const cropW = Math.min(sw, Math.max(1, input.cropW));
  const cropH = Math.min(sh, Math.max(1, input.cropH));

  const preferredLeft = input.focalX * sw - cropW / 2;
  const preferredTop = input.focalY * sh - cropH / 2;

  let left = preferredLeft;
  let top = preferredTop;

  if (input.subject && input.subject.width > 0 && input.subject.height > 0) {
    const sx = input.subject.x * sw;
    const sy = input.subject.y * sh;
    const sr = (input.subject.x + input.subject.width) * sw;
    const sb = (input.subject.y + input.subject.height) * sh;

    const xRange = subjectAxisClampRange(sx, sr, cropW, sw);
    if (xRange) {
      left = Math.min(Math.max(preferredLeft, xRange.min), xRange.max);
    }
    const yRange = subjectAxisClampRange(sy, sb, cropH, sh);
    if (yRange) {
      top = Math.min(Math.max(preferredTop, yRange.min), yRange.max);
    }
  }

  left = Math.min(Math.max(0, left), Math.max(0, sw - cropW));
  top = Math.min(Math.max(0, top), Math.max(0, sh - cropH));
  return { left, top };
}

/**
 * True when the crop fully contains the subject rect (normalized → pixels).
 * Used by tests to verify head margin across a zoom sequence.
 */
export function cropContainsSubject(
  crop: Pick<KenBurnsSourceCrop, "left" | "top" | "width" | "height">,
  subject: NormalizedRect,
  sourceWidth: number,
  sourceHeight: number,
  /** Allow tiny float slack (px). */
  epsilonPx = 1,
): boolean {
  const sx = subject.x * sourceWidth;
  const sy = subject.y * sourceHeight;
  const sr = (subject.x + subject.width) * sourceWidth;
  const sb = (subject.y + subject.height) * sourceHeight;
  return (
    crop.left <= sx + epsilonPx &&
    crop.top <= sy + epsilonPx &&
    crop.left + crop.width >= sr - epsilonPx &&
    crop.top + crop.height >= sb - epsilonPx
  );
}

/**
 * Effective zoom amount after face-aware caps.
 */
export function resolveEffectiveZoomAmount(
  requested: number,
  framing: MediaFraming | null | undefined,
): number {
  const z = Math.max(0, requested);
  if (!framing?.maxZoomAmount && framing?.maxZoomAmount !== 0) return z;
  if (framing.maxZoomAmount == null) return z;
  return Math.min(z, Math.max(0, framing.maxZoomAmount));
}

/**
 * Further cap zoom so heads stay framable at max zoom (scale = 1+z).
 *
 * Uses most of the padded subject (headroom included) so hairlines are not
 * clipped. Prefer keeping faces over forcing a minimum Ken Burns amount —
 * when the subject already fills the cover window, return 0 (hold face crop)
 * rather than zooming in and cutting heads.
 */
export const MIN_VISIBLE_KEN_BURNS_ZOOM = 0.08;

/**
 * When the caller asked for motion but face-fit capped zoom near zero, keep a
 * small continuous zoom so clips are not static holds.
 */
export const MIN_REQUESTED_CLIP_MOTION_ZOOM = 0.05;

/** Fraction of padded subjectBounds that must remain inside the max-zoom crop. */
export const SUBJECT_FIT_CORE_FRACTION = 0.72;

export function capZoomToFitSubject(input: {
  zoomAmount: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  subject: NormalizedRect | null | undefined;
}): number {
  const z = Math.max(0, input.zoomAmount);
  if (!input.subject || z <= 0) return z;

  const base = baseCoverSize(
    input.sourceWidth,
    input.sourceHeight,
    input.targetWidth,
    input.targetHeight,
  );
  const coreFraction = SUBJECT_FIT_CORE_FRACTION;
  const subjectW = input.subject.width * coreFraction * input.sourceWidth;
  const subjectH = input.subject.height * coreFraction * input.sourceHeight;
  // At scale s, crop = base/s. Prefer subject core <= crop ⇒ s <= base/subject.
  const maxScaleW = subjectW > 1 ? base.width / subjectW : Number.POSITIVE_INFINITY;
  const maxScaleH =
    subjectH > 1 ? base.height / subjectH : Number.POSITIVE_INFINITY;
  const maxScale = Math.min(maxScaleW, maxScaleH);
  if (!Number.isFinite(maxScale) || maxScale <= 1) {
    // Subject already fills the cover window — hold face-anchored still.
    return 0;
  }
  const fitted = Math.min(z, Math.max(0, maxScale - 1));
  // Allow gentle motion when it still fits; never force zoom past headroom.
  if (fitted >= MIN_VISIBLE_KEN_BURNS_ZOOM) return fitted;
  return fitted;
}

/**
 * Start/end absolute scales for a clip. In and out use the same magnitude.
 *   in:  1 → 1+z
 *   out: 1+z → 1
 */
export function resolveKenBurnsScaleRange(
  direction: "in" | "out" | "none",
  zoomAmount: number,
): { startScale: number; endScale: number } {
  const z = Math.max(0, zoomAmount);
  if (direction === "none" || z <= 0) {
    return { startScale: 1, endScale: 1 };
  }
  if (direction === "in") {
    return { startScale: 1, endScale: 1 + z };
  }
  return { startScale: 1 + z, endScale: 1 };
}

/**
 * How many source pixels the cover window has vs the output frame.
 * < 1 means the photo must already upscale to fill (small / soft source).
 */
export function sourceCoverScale(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  const base = baseCoverSize(
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
  );
  return Math.min(
    base.width / Math.max(1, targetWidth),
    base.height / Math.max(1, targetHeight),
  );
}

/**
 * Cap zoom so Ken Burns does not shrink the extract below the output frame
 * when the source has enough resolution. Prevents muddy upscales from tight
 * zooms on large photos. If the cover window is already smaller than the
 * frame, kill zoom — forced motion on small sources only softens further.
 */
export function capZoomToAvoidUpscale(input: {
  zoomAmount: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}): number {
  const z = Math.max(0, input.zoomAmount);
  if (z <= 0) return z;
  const coverScale = sourceCoverScale(
    input.sourceWidth,
    input.sourceHeight,
    input.targetWidth,
    input.targetHeight,
  );
  // Already soft at rest — hold face-anchored (or center) fill, no extra zoom.
  if (coverScale < 1) return 0;
  const maxZoom = Math.max(0, coverScale - 1);
  return Math.min(z, maxZoom);
}

/**
 * Primary helper: start + end source crops (and scale) for a clip.
 */
export function getKenBurnsFraming(input: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  direction: "in" | "out" | "none";
  zoomAmount: number;
  framing?: MediaFraming | null;
}): {
  zoomAmount: number;
  start: KenBurnsSourceCrop;
  end: KenBurnsSourceCrop;
  focalPointX: number;
  focalPointY: number;
  startScale: number;
  endScale: number;
} {
  const framing = input.framing ?? centerFraming();
  let zoomAmount = resolveEffectiveZoomAmount(input.zoomAmount, framing);
  zoomAmount = capZoomToFitSubject({
    zoomAmount,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    targetWidth: input.targetWidth,
    targetHeight: input.targetHeight,
    subject: framing.subjectBounds,
  });

  const coverScale = sourceCoverScale(
    input.sourceWidth,
    input.sourceHeight,
    input.targetWidth,
    input.targetHeight,
  );

  // Prefer continuous face-centered motion over a static hold when zoom was
  // requested — but never force motion that would upscale a small photo.
  if (
    coverScale >= 1 &&
    input.direction !== "none" &&
    input.zoomAmount > 0 &&
    zoomAmount < MIN_REQUESTED_CLIP_MOTION_ZOOM
  ) {
    zoomAmount = Math.min(input.zoomAmount, MIN_REQUESTED_CLIP_MOTION_ZOOM);
  }

  // Prefer sharpness: don't zoom past 1:1 source→output (or at all when soft).
  zoomAmount = capZoomToAvoidUpscale({
    zoomAmount,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    targetWidth: input.targetWidth,
    targetHeight: input.targetHeight,
  });

  const { startScale, endScale } = resolveKenBurnsScaleRange(
    input.direction,
    zoomAmount,
  );

  const start = sourceCropAtScale({
    scale: startScale,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    targetWidth: input.targetWidth,
    targetHeight: input.targetHeight,
    framing,
  });
  const end = sourceCropAtScale({
    scale: endScale,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    targetWidth: input.targetWidth,
    targetHeight: input.targetHeight,
    framing,
  });

  return {
    zoomAmount,
    start,
    end,
    startScale,
    endScale,
    focalPointX: framing.focalPointX,
    focalPointY: framing.focalPointY,
  };
}

/** Snap to even pixels for stabler yuv420p chroma when crops are scaled. */
function snapEvenSize(n: number): number {
  const r = Math.max(2, Math.round(n));
  return r - (r % 2);
}

/**
 * Integer crop rect with even W/H, clamped to source — reduces still-motion
 * jitter from odd-sized extracts and 1px left/top flicker between frames.
 */
export function snapSourceCropRect(input: {
  left: number;
  top: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}): { left: number; top: number; width: number; height: number } {
  const sw = Math.max(1, input.sourceWidth);
  const sh = Math.max(1, input.sourceHeight);
  let width = Math.min(sw, snapEvenSize(input.width));
  let height = Math.min(sh, snapEvenSize(input.height));
  // Prefer even dims; if source itself is odd, allow a 1px remainder.
  if (width > sw) width = sw - (sw % 2 === 0 ? 0 : 1) || 1;
  if (height > sh) height = sh - (sh % 2 === 0 ? 0 : 1) || 1;
  width = Math.max(1, Math.min(sw, width));
  height = Math.max(1, Math.min(sh, height));

  let left = Math.round(input.left);
  let top = Math.round(input.top);
  left = Math.min(Math.max(0, left), Math.max(0, sw - width));
  top = Math.min(Math.max(0, top), Math.max(0, sh - height));

  // Re-clamp after placement if floating-point placement overshoots.
  width = Math.min(width, sw - left);
  height = Math.min(height, sh - top);
  if (width >= 2 && width % 2 === 1) width -= 1;
  if (height >= 2 && height % 2 === 1) height -= 1;
  width = Math.max(1, width);
  height = Math.max(1, height);

  return { left, top, width, height };
}

/**
 * Keep float crop geometry inside the image. Prefer this for Ken Burns samples
 * so motion is not quantized to whole pixels between frames.
 */
export function clampSourceCropFloat(input: {
  left: number;
  top: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scale?: number;
}): KenBurnsSourceCrop {
  const sw = Math.max(1, input.sourceWidth);
  const sh = Math.max(1, input.sourceHeight);
  const width = Math.max(1, Math.min(sw, input.width));
  const height = Math.max(1, Math.min(sh, input.height));
  const left = Math.max(0, Math.min(input.left, sw - width));
  const top = Math.max(0, Math.min(input.top, sh - height));
  return {
    left,
    top,
    width: Math.min(width, sw - left),
    height: Math.min(height, sh - top),
    scale: input.scale ?? 1,
  };
}

export function sourceCropAtScale(input: {
  scale: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  framing: MediaFraming;
}): KenBurnsSourceCrop {
  const scale = Math.max(1, input.scale);
  const base = baseCoverSize(
    input.sourceWidth,
    input.sourceHeight,
    input.targetWidth,
    input.targetHeight,
  );
  // Keep floating-point crop size/position so successive samples can move by
  // sub-pixel amounts (even-snap stair steps were a major jerk source).
  const cropW = Math.max(1, Math.min(input.sourceWidth, base.width / scale));
  const cropH = Math.max(1, Math.min(input.sourceHeight, base.height / scale));
  const { left, top } = placeCropAroundFocal({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    cropW,
    cropH,
    focalX: input.framing.focalPointX,
    focalY: input.framing.focalPointY,
    subject: input.framing.subjectBounds,
  });

  return clampSourceCropFloat({
    left,
    top,
    width: cropW,
    height: cropH,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    scale,
  });
}

/**
 * Interpolate between start and end source crops with eased progress 0→1.
 * Keeps float geometry; callers that need integer extract should use
 * {@link snapSourceCropRect} or the sub-pixel render path in the generator.
 */
export function interpolateSourceCrop(
  start: KenBurnsSourceCrop,
  end: KenBurnsSourceCrop,
  easedProgress: number,
  sourceWidth?: number,
  sourceHeight?: number,
): KenBurnsSourceCrop {
  const t = Math.min(1, Math.max(0, easedProgress));
  const lerp = (a: number, b: number) => a + (b - a) * t;

  const startCx = start.left + start.width / 2;
  const startCy = start.top + start.height / 2;
  const endCx = end.left + end.width / 2;
  const endCy = end.top + end.height / 2;

  const widthF = Math.max(1, lerp(start.width, end.width));
  const heightF = Math.max(1, lerp(start.height, end.height));
  const cx = lerp(startCx, endCx);
  const cy = lerp(startCy, endCy);

  const sw = sourceWidth ?? Math.max(start.left + start.width, end.left + end.width);
  const sh =
    sourceHeight ?? Math.max(start.top + start.height, end.top + end.height);

  return clampSourceCropFloat({
    left: cx - widthF / 2,
    top: cy - heightF / 2,
    width: widthF,
    height: heightF,
    sourceWidth: Math.max(1, sw),
    sourceHeight: Math.max(1, sh),
    scale: lerp(start.scale, end.scale),
  });
}
