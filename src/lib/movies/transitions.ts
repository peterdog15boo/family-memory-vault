/**
 * Clip-to-clip transitions for the frame-based movie renderer.
 *
 * Intermediate JPEG frames (sharp) so motion survives ffmpeg concat —
 * sample density tracks encode fps for smooth final exports.
 *
 * Why not ffmpeg xfade?
 *   Per-clip MP4 → xfade → remux would force a second encode pass and make it
 *   harder to guarantee face-aware endpoints + the AAC music bed. We keep
 *   Sharp composites between moving Ken Burns frames of A and B (zoom continues
 *   through the dissolve), then concat once (music mix unchanged).
 *
 * Catalog / UI metadata lives in transition-catalog.ts (safe for client).
 */

import sharp from "sharp";
import { easeInOutCubic, splitDurationMs } from "@/lib/movies/motion";
import type { MovieTransition } from "@/lib/movies/settings";
import { MOVIE_TRANSITIONS } from "@/lib/movies/settings";
import type { Rgb } from "@/lib/movies/themes";
import { getTransitionCatalogEntry } from "@/lib/movies/transition-catalog";

export type {
  TransitionCatalogEntry,
} from "@/lib/movies/transition-catalog";
export {
  TRANSITION_CATALOG,
  getTransitionCatalogEntry,
} from "@/lib/movies/transition-catalog";

export type TransitionFrame = {
  jpeg: Buffer;
  durationMs: number;
};

const DISSOLVE_STYLES = new Set<MovieTransition>([
  "crossfade",
  "soft_dissolve",
  "soft_cut",
  "fade",
  "fade_white",
  "blur_dissolve",
]);

/** Soft cubic for most motion; quint for dissolve softness. */
export function easeInOutQuint(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5
    ? 16 * x * x * x * x * x
    : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

/** Sine ease — continuous derivative, cleaner crossfades than cubic. */
export function easeInOutSine(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/**
 * Warp linear progress so fade-through-black/white spends more time near the
 * solid dip (true “through black”) instead of rushing past mid-gray.
 */
export function warpFadeThroughProgress(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const centered = (x - 0.5) * 2;
  // Exponent > 1 pulls values toward 0 ⇒ progress stays nearer 0.5 longer.
  const shaped =
    Math.sign(centered) * Math.pow(Math.abs(centered), 1.35);
  return shaped * 0.5 + 0.5;
}

/**
 * Exclusive-endpoint progress for sample i of count.
 * Avoids duplicating the outgoing last frame (t=0) and incoming first (t=1)
 * which caused a visible stutter / hold at each junction.
 */
export function transitionSampleProgress(
  index: number,
  count: number,
): number {
  if (count <= 0) return 1;
  if (count === 1) return 0.5;
  return (index + 1) / (count + 1);
}

function rgbCss(c: Rgb): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

function srgbToLinear(c: number): number {
  const x = Math.min(255, Math.max(0, c)) / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const x = Math.min(1, Math.max(0, c));
  const v =
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, v * 255)));
}

export function resolveTransitionDurationMs(input: {
  style: MovieTransition;
  themeDurationMs: number;
  clipDurationMs: number;
  overrideMs?: number | null;
}): number {
  if (input.style === "none") return 0;

  const catalogDefault = getTransitionCatalogEntry(input.style).defaultDurationMs;
  const base =
    input.overrideMs && input.overrideMs > 0
      ? input.overrideMs
      : input.themeDurationMs > 0
        ? input.themeDurationMs
        : catalogDefault;

  if (input.style === "soft_cut") {
    return Math.min(Math.max(base, 160), 320);
  }

  // Cap so a short clip is not mostly transition — still allow polished dissolves.
  const clipCap = Math.max(280, Math.floor(input.clipDurationMs * 0.4));
  return Math.min(Math.max(base, 180), clipCap, 3000);
}

/**
 * Half of the transition duration trimmed from each adjacent clip so the
 * dissolve *overlaps* content instead of stacking extra runtime.
 */
export function transitionOverlapMs(transitionDurationMs: number): number {
  if (transitionDurationMs <= 0) return 0;
  return Math.max(0, Math.floor(transitionDurationMs / 2));
}

/**
 * Sample density tracks encode fps so transitions stay smooth in the
 * final MP4 (not a handful of held JPEGs). Dissolves oversample slightly.
 */
export function transitionSampleCount(
  style: MovieTransition,
  durationMs: number,
  options?: { fps?: number; fast?: boolean },
): number {
  if (style === "none" || durationMs <= 0) return 0;

  const encodeFps = Math.max(1, options?.fps ?? 30);
  const seconds = durationMs / 1000;
  const dissolve = DISSOLVE_STYLES.has(style);

  if (options?.fast) {
    const fps = Math.min(12, encodeFps);
    if (style === "soft_cut") {
      return Math.max(4, Math.min(Math.round(seconds * fps), 8));
    }
    return Math.max(6, Math.min(Math.round(seconds * fps), 24));
  }

  // Match encode cadence; soft dissolves oversample so blends don’t stair-step.
  const density = dissolve ? encodeFps * 1.5 : Math.max(24, encodeFps);
  if (style === "soft_cut") {
    return Math.max(4, Math.min(Math.round(seconds * density), 14));
  }

  const max = Math.min(120, Math.round(encodeFps * 4));
  return Math.max(10, Math.min(Math.round(seconds * density), max));
}

/**
 * Trim hold durations from the end of a rendered frame list (current clip).
 * Returns how many ms were actually removed.
 */
export function trimFrameDurationsFromEnd(
  frames: Array<{ durationMs: number; kind?: string }>,
  fromIndex: number,
  trimMs: number,
): number {
  let remaining = Math.max(0, Math.round(trimMs));
  if (remaining <= 0 || fromIndex >= frames.length) return 0;

  for (let i = frames.length - 1; i >= fromIndex && remaining > 0; i--) {
    const frame = frames[i]!;
    if (frame.kind && frame.kind !== "photo") break;
    // Keep a 1-frame foothold so the clip doesn’t vanish.
    const reducible = Math.max(0, frame.durationMs - 1);
    const cut = Math.min(reducible, remaining);
    frame.durationMs -= cut;
    remaining -= cut;
  }
  return Math.max(0, Math.round(trimMs) - remaining);
}

/**
 * Trim hold durations from the start of a Ken Burns sample list (incoming clip).
 */
export function trimSampleHoldsFromStart(
  samples: Array<{ holdMs: number }>,
  trimMs: number,
): number {
  let remaining = Math.max(0, Math.round(trimMs));
  if (remaining <= 0 || samples.length === 0) return 0;

  for (let i = 0; i < samples.length && remaining > 0; i++) {
    const sample = samples[i]!;
    const reducible = Math.max(0, sample.holdMs - 1);
    const cut = Math.min(reducible, remaining);
    sample.holdMs -= cut;
    remaining -= cut;
  }
  return Math.max(0, Math.round(trimMs) - remaining);
}

export async function renderTransitionFrames(input: {
  style: MovieTransition;
  /** Static outgoing frame (used when fromJpegs is omitted). */
  fromJpeg?: Buffer;
  /** Static incoming frame (used when toJpegs is omitted). */
  toJpeg?: Buffer;
  /**
   * Per-sample outgoing frames (Ken Burns continues through the dissolve).
   * Length must match the transition sample count.
   */
  fromJpegs?: Buffer[];
  /** Per-sample incoming frames (next clip zoom starts during the dissolve). */
  toJpegs?: Buffer[];
  durationMs: number;
  width: number;
  height: number;
  background: Rgb;
  fast?: boolean;
  /** Match movie encode fps for smooth exports. */
  fps?: number;
  /** Match frame JPEG quality when available. */
  jpegQuality?: number;
}): Promise<TransitionFrame[]> {
  const { style, durationMs, width, height, background, fast } = input;
  if (style === "none" || durationMs <= 0) return [];
  if (!(MOVIE_TRANSITIONS as readonly string[]).includes(style)) return [];

  const count = transitionSampleCount(style, durationMs, {
    fps: input.fps,
    fast,
  });
  if (count <= 0) return [];

  const quality = Math.min(
    99,
    Math.max(90, input.jpegQuality ?? (fast ? 92 : 96)),
  );
  const durations = splitDurationMs(durationMs, count);
  const frames: TransitionFrame[] = [];

  const moving =
    Array.isArray(input.fromJpegs) &&
    Array.isArray(input.toJpegs) &&
    input.fromJpegs.length >= count &&
    input.toJpegs.length >= count;

  if (!moving && (!input.fromJpeg || !input.toJpeg)) {
    return [];
  }

  const fromBufStatic = moving
    ? null
    : await toRgba(input.fromJpeg!, width, height);
  const toBufStatic = moving
    ? null
    : await toRgba(input.toJpeg!, width, height);

  for (let i = 0; i < count; i++) {
    const linear = transitionSampleProgress(i, count);
    const fromJpeg = moving ? input.fromJpegs![i]! : input.fromJpeg!;
    const toJpeg = moving ? input.toJpegs![i]! : input.toJpeg!;
    const fromBuf = moving
      ? await toRgba(fromJpeg, width, height)
      : fromBufStatic!;
    const toBuf = moving ? await toRgba(toJpeg, width, height) : toBufStatic!;
    const jpeg = await renderTransitionSample({
      style,
      from: fromBuf,
      to: toBuf,
      fromJpeg,
      toJpeg,
      linear,
      width,
      height,
      background,
      quality,
    });
    frames.push({ jpeg, durationMs: durations[i]! });
  }

  return frames;
}

async function renderTransitionSample(input: {
  style: MovieTransition;
  from: Buffer;
  to: Buffer;
  fromJpeg: Buffer;
  toJpeg: Buffer;
  linear: number;
  width: number;
  height: number;
  background: Rgb;
  quality: number;
}): Promise<Buffer> {
  const { style, from, to, linear, width, height, background, quality } =
    input;
  const t = Math.min(1, Math.max(0, linear));

  switch (style) {
    case "soft_cut":
      return blendRaw(from, to, easeInOutCubic(t), width, height, quality, {
        gamma: true,
      });
    case "crossfade":
      return blendRaw(from, to, easeInOutSine(t), width, height, quality, {
        gamma: true,
      });
    case "soft_dissolve":
      return softDissolve(
        from,
        to,
        easeInOutQuint(t),
        width,
        height,
        quality,
      );
    case "fade":
      return fadeThroughColorRaw(
        from,
        to,
        { r: 0, g: 0, b: 0 },
        warpFadeThroughProgress(easeInOutSine(t)),
        width,
        height,
        quality,
      );
    case "fade_white":
      return fadeThroughColorRaw(
        from,
        to,
        { r: 255, g: 255, b: 255 },
        warpFadeThroughProgress(easeInOutSine(t)),
        width,
        height,
        quality,
      );
    case "slide":
      return slideRaw(from, to, easeInOutCubic(t), width, height, quality, "left");
    case "slide_right":
      return slideRaw(
        from,
        to,
        easeInOutCubic(t),
        width,
        height,
        quality,
        "right",
      );
    case "push":
      return pushRaw(from, to, easeInOutCubic(t), width, height, quality);
    case "zoom_through":
      return zoomThrough(
        input.fromJpeg,
        input.toJpeg,
        easeInOutCubic(t),
        width,
        height,
        quality,
      );
    case "blur_dissolve":
      return blurDissolve(
        from,
        to,
        easeInOutSine(t),
        width,
        height,
        quality,
      );
    case "light_leak":
      return lightLeakWipe(
        from,
        to,
        easeInOutCubic(t),
        width,
        height,
        background,
        quality,
      );
    case "none":
    default:
      return input.fromJpeg;
  }
}

async function toRgba(
  jpeg: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(jpeg)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

async function encodeRaw(
  raw: Buffer,
  width: number,
  height: number,
  quality: number,
): Promise<Buffer> {
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/**
 * Crossfade in linear-light when gamma=true — reduces muddy mid-blend vs
 * naive 8-bit sRGB lerp (visible on dissolves between bright/dark stills).
 */
async function blendRaw(
  from: Buffer,
  to: Buffer,
  t: number,
  width: number,
  height: number,
  quality: number,
  opts?: { gamma?: boolean },
): Promise<Buffer> {
  const out = Buffer.alloc(from.length);
  const a = Math.min(1, Math.max(0, t));
  const b = 1 - a;
  const gamma = opts?.gamma !== false;

  if (!gamma) {
    for (let i = 0; i < from.length; i += 4) {
      out[i] = Math.round(from[i]! * b + to[i]! * a);
      out[i + 1] = Math.round(from[i + 1]! * b + to[i + 1]! * a);
      out[i + 2] = Math.round(from[i + 2]! * b + to[i + 2]! * a);
      out[i + 3] = 255;
    }
  } else {
    for (let i = 0; i < from.length; i += 4) {
      out[i] = linearToSrgb(
        srgbToLinear(from[i]!) * b + srgbToLinear(to[i]!) * a,
      );
      out[i + 1] = linearToSrgb(
        srgbToLinear(from[i + 1]!) * b + srgbToLinear(to[i + 1]!) * a,
      );
      out[i + 2] = linearToSrgb(
        srgbToLinear(from[i + 2]!) * b + srgbToLinear(to[i + 2]!) * a,
      );
      out[i + 3] = 255;
    }
  }
  return encodeRaw(out, width, height, quality);
}

/** Soft dissolve: gamma crossfade + very light mid-transition bloom. */
async function softDissolve(
  from: Buffer,
  to: Buffer,
  t: number,
  width: number,
  height: number,
  quality: number,
): Promise<Buffer> {
  const blended = await blendRaw(from, to, t, width, height, quality, {
    gamma: true,
  });
  const mid = 1 - Math.abs(2 * t - 1);
  const sigma = mid * 1.8;
  if (sigma < 0.45) return blended;
  return sharp(blended)
    .blur(sigma)
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/** Dip fully through a solid color, then rise into the next still. */
async function fadeThroughColorRaw(
  from: Buffer,
  to: Buffer,
  color: Rgb,
  t: number,
  width: number,
  height: number,
  quality: number,
): Promise<Buffer> {
  const out = Buffer.alloc(from.length);
  if (t <= 0.5) {
    const a = t * 2;
    const b = 1 - a;
    for (let i = 0; i < from.length; i += 4) {
      out[i] = linearToSrgb(
        srgbToLinear(from[i]!) * b + srgbToLinear(color.r) * a,
      );
      out[i + 1] = linearToSrgb(
        srgbToLinear(from[i + 1]!) * b + srgbToLinear(color.g) * a,
      );
      out[i + 2] = linearToSrgb(
        srgbToLinear(from[i + 2]!) * b + srgbToLinear(color.b) * a,
      );
      out[i + 3] = 255;
    }
  } else {
    const a = (t - 0.5) * 2;
    const b = 1 - a;
    for (let i = 0; i < from.length; i += 4) {
      out[i] = linearToSrgb(
        srgbToLinear(color.r) * b + srgbToLinear(to[i]!) * a,
      );
      out[i + 1] = linearToSrgb(
        srgbToLinear(color.g) * b + srgbToLinear(to[i + 1]!) * a,
      );
      out[i + 2] = linearToSrgb(
        srgbToLinear(color.b) * b + srgbToLinear(to[i + 2]!) * a,
      );
      out[i + 3] = 255;
    }
  }
  return encodeRaw(out, width, height, quality);
}

async function slideRaw(
  from: Buffer,
  to: Buffer,
  t: number,
  width: number,
  height: number,
  quality: number,
  direction: "left" | "right",
): Promise<Buffer> {
  const offset = Math.min(width, Math.max(0, Math.round(width * t)));
  const out = Buffer.alloc(from.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      if (direction === "left") {
        if (x >= width - offset) {
          const sx = x - (width - offset);
          const si = (y * width + sx) * 4;
          out[di] = to[si]!;
          out[di + 1] = to[si + 1]!;
          out[di + 2] = to[si + 2]!;
        } else {
          const dim = 1 - t * 0.12;
          out[di] = Math.round(from[di]! * dim);
          out[di + 1] = Math.round(from[di + 1]! * dim);
          out[di + 2] = Math.round(from[di + 2]! * dim);
        }
      } else if (x < offset) {
        const si = (y * width + x) * 4;
        out[di] = to[si]!;
        out[di + 1] = to[si + 1]!;
        out[di + 2] = to[si + 2]!;
      } else {
        const dim = 1 - t * 0.12;
        out[di] = Math.round(from[di]! * dim);
        out[di + 1] = Math.round(from[di + 1]! * dim);
        out[di + 2] = Math.round(from[di + 2]! * dim);
      }
      out[di + 3] = 255;
    }
  }
  return encodeRaw(out, width, height, quality);
}

/** Both frames travel together — gentler than a hard wipe. */
async function pushRaw(
  from: Buffer,
  to: Buffer,
  t: number,
  width: number,
  height: number,
  quality: number,
): Promise<Buffer> {
  const offset = Math.min(width, Math.max(0, Math.round(width * t)));
  const out = Buffer.alloc(from.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const srcX = x + offset;
      if (srcX < width) {
        const si = (y * width + srcX) * 4;
        out[di] = from[si]!;
        out[di + 1] = from[si + 1]!;
        out[di + 2] = from[si + 2]!;
      } else {
        const sx = srcX - width;
        const si = (y * width + sx) * 4;
        out[di] = to[si]!;
        out[di + 1] = to[si + 1]!;
        out[di + 2] = to[si + 2]!;
      }
      out[di + 3] = 255;
    }
  }
  return encodeRaw(out, width, height, quality);
}

async function zoomFrame(
  jpeg: Buffer,
  scale: number,
  width: number,
  height: number,
): Promise<Buffer> {
  const s = Math.max(1, scale);
  const rw = Math.max(width, Math.round(width * s));
  const rh = Math.max(height, Math.round(height * s));
  const left = Math.max(0, Math.floor((rw - width) / 2));
  const top = Math.max(0, Math.floor((rh - height) / 2));
  return sharp(jpeg)
    .resize(rw, rh, { fit: "fill", kernel: "lanczos3" })
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

async function zoomThrough(
  fromJpeg: Buffer,
  toJpeg: Buffer,
  t: number,
  width: number,
  height: number,
  quality: number,
): Promise<Buffer> {
  const fromScale = 1 + t * 0.32;
  const toScale = 1.28 - t * 0.28;
  const [fromZ, toZ] = await Promise.all([
    zoomFrame(fromJpeg, fromScale, width, height),
    zoomFrame(toJpeg, toScale, width, height),
  ]);
  return blendRaw(fromZ, toZ, t, width, height, quality, { gamma: true });
}

async function blurDissolve(
  from: Buffer,
  to: Buffer,
  t: number,
  width: number,
  height: number,
  quality: number,
): Promise<Buffer> {
  const blended = await blendRaw(from, to, t, width, height, quality, {
    gamma: true,
  });
  const mid = 1 - Math.abs(2 * t - 1);
  const sigma = 0.3 + mid * 8;
  if (sigma <= 0.35) return blended;
  return sharp(blended)
    .blur(sigma)
    .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function lightLeakWipe(
  from: Buffer,
  to: Buffer,
  t: number,
  width: number,
  height: number,
  background: Rgb,
  quality: number,
): Promise<Buffer> {
  const soft = Math.max(24, Math.round(width * 0.14));
  const edge = t * (width + soft * 2) - soft;
  const warm = {
    r: Math.min(255, 255),
    g: Math.min(255, 170 + Math.round(background.g * 0.1)),
    b: Math.min(255, 90 + Math.round(background.r * 0.08)),
  };
  const out = Buffer.alloc(from.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const local = (x - (edge - soft)) / soft;
      const mix = Math.min(1, Math.max(0, local));
      const leak =
        Math.max(0, 1 - Math.abs(local - 0.5) * 2) *
        (0.35 + 0.45 * Math.sin(Math.PI * t));

      const r =
        srgbToLinear(from[di]!) * (1 - mix) + srgbToLinear(to[di]!) * mix;
      const g =
        srgbToLinear(from[di + 1]!) * (1 - mix) +
        srgbToLinear(to[di + 1]!) * mix;
      const b =
        srgbToLinear(from[di + 2]!) * (1 - mix) +
        srgbToLinear(to[di + 2]!) * mix;

      out[di] = linearToSrgb(
        r * (1 - leak * 0.15) + srgbToLinear(warm.r) * leak,
      );
      out[di + 1] = linearToSrgb(
        g * (1 - leak * 0.2) + srgbToLinear(warm.g) * leak,
      );
      out[di + 2] = linearToSrgb(
        b * (1 - leak * 0.35) + srgbToLinear(warm.b) * leak,
      );
      out[di + 3] = 255;
    }
  }
  return encodeRaw(out, width, height, quality);
}

export async function renderBackgroundHold(
  background: Rgb,
  width: number,
  height: number,
  darkness: number,
): Promise<Buffer> {
  const alpha = Math.min(1, Math.max(0.35, darkness));
  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${rgbCss(background)}"/>
  <rect width="100%" height="100%" fill="#000" opacity="${alpha * 0.55}"/>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 96, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
}
