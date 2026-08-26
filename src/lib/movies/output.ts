/**
 * Output resolution + social encode profiles for movie exports.
 * Modular so quality can keep improving without touching frame rendering.
 */

import type { NormalizedMovieSettings, QualityMode } from "@/lib/movies/settings";

export type MovieAspectRatio = NormalizedMovieSettings["aspectRatio"];

export type MovieOutputSpec = {
  width: number;
  height: number;
  label: string;
  /** ffmpeg libx264 preset */
  x264Preset: "veryfast" | "faster" | "medium" | "slow";
  /** Constant rate factor — lower = sharper */
  crf: number;
  profile: "main" | "high";
  level: string;
  fps: number;
  /** JPEG quality for rendered still frames */
  frameJpegQuality: number;
  /**
   * Soft VBV ceiling for social platforms (e.g. "12M").
   * Keeps peak bitrate predictable without crushing quality below CRF.
   */
  maxrate: string;
  bufsize: string;
};

const ASPECT_LABELS: Record<MovieAspectRatio, string> = {
  "16:9": "Landscape · best for YouTube & TV",
  "1:1": "Square · best for feeds",
  "9:16": "Vertical · best for Stories & Reels",
};

/**
 * Resolve export canvas size + encode profile from aspect + quality mode.
 * Primary default: 1080p. Ultra: 4K when requested (plan-gated).
 */
export function resolveMovieOutputSpec(options: {
  aspectRatio: MovieAspectRatio;
  qualityMode: QualityMode;
  /** When false, ultra is clamped to standard 1080p */
  allowUltra?: boolean;
}): MovieOutputSpec {
  const aspect = options.aspectRatio;
  let mode = options.qualityMode;
  if (mode === "ultra" && options.allowUltra === false) {
    mode = "standard";
  }

  const dims = dimensionsForAspectQuality(aspect, mode);
  const encode = encodeProfileForQuality(mode);

  return {
    ...dims,
    ...encode,
    label: `${modeLabel(mode)} · ${aspect} · ${dims.width}×${dims.height}`,
  };
}

export function aspectRatioHint(aspect: MovieAspectRatio): string {
  return ASPECT_LABELS[aspect];
}

function modeLabel(mode: QualityMode): string {
  switch (mode) {
    case "fast":
      return "Fast";
    case "ultra":
      return "Ultra 4K";
    case "standard":
    default:
      return "1080p";
  }
}

function dimensionsForAspectQuality(
  aspect: MovieAspectRatio,
  quality: QualityMode,
): { width: number; height: number } {
  if (quality === "fast") {
    switch (aspect) {
      case "9:16":
        return { width: 720, height: 1280 };
      case "1:1":
        return { width: 1080, height: 1080 };
      case "16:9":
      default:
        return { width: 1280, height: 720 };
    }
  }

  if (quality === "ultra") {
    switch (aspect) {
      case "9:16":
        return { width: 2160, height: 3840 };
      case "1:1":
        return { width: 2160, height: 2160 };
      case "16:9":
      default:
        return { width: 3840, height: 2160 };
    }
  }

  // standard → 1080p family (social-post default)
  switch (aspect) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
    default:
      return { width: 1920, height: 1080 };
  }
}

function encodeProfileForQuality(quality: QualityMode): Omit<
  MovieOutputSpec,
  "width" | "height" | "label"
> {
  switch (quality) {
    case "fast":
      return {
        x264Preset: "faster",
        // Still a draft path, but CRF 23 was visibly soft on social exports.
        crf: 18,
        profile: "high",
        level: "4.0",
        // Match motion sampling to delivery fps (was 24fps encode / 15fps crops).
        fps: 30,
        frameJpegQuality: 95,
        maxrate: "8M",
        bufsize: "16M",
      };
    case "ultra":
      // Premium 4K path — slower encode, higher bit budget.
      return {
        x264Preset: "slow",
        crf: 14,
        profile: "high",
        level: "5.1",
        fps: 30,
        frameJpegQuality: 99,
        maxrate: "48M",
        bufsize: "96M",
      };
    case "standard":
    default:
      // Share-ready 1080p: social-presentable sharpness over encode speed.
      return {
        x264Preset: "slow",
        crf: 11,
        profile: "high",
        level: "4.1",
        fps: 30,
        // Near-lossless intermediates — JPEG→H.264 is already one generation.
        frameJpegQuality: 99,
        maxrate: "24M",
        bufsize: "48M",
      };
  }
}

/**
 * Scale theme font sizes so titles stay crisp when exporting above the
 * historical 720p design baseline.
 */
export function scaleThemeFontSize(
  designSize: number,
  outputHeight: number,
): number {
  const baseline = 720;
  const scale = Math.max(0.85, Math.min(3.2, outputHeight / baseline));
  return Math.round(designSize * scale);
}

/** How source media is fit into the export canvas. */
export type EncodeFitMode = "cover" | "contain" | "exact";

/**
 * ffmpeg -vf chain: lanczos scale, SAR 1, yuv420p, optional fps.
 *
 * - `cover` (default for memory videos): fill the frame; portrait sources are
 *   zoomed/cropped — no pillarbox/letterbox bars.
 * - `contain`: letterbox/pillarbox (legacy / rare).
 * - `exact`: stretch to WxH (photo Ken Burns frames already match the canvas).
 *
 * Use the fps *filter* (not output -r) so concat `duration` lines are honored.
 */
export function buildEncodeVideoFilter(
  width: number,
  height: number,
  fps?: number,
  fit: EncodeFitMode = "cover",
  options?: {
    /** Normalized focal point for cover crops (faces / smart center). */
    focalX?: number;
    focalY?: number;
    /**
     * When fit is `exact` and frames are already WxH, skip scale= to avoid a
     * redundant lanczos resample before encode.
     */
    assumeExactSize?: boolean;
  },
): string {
  const w = Math.max(2, Math.round(width / 2) * 2);
  const h = Math.max(2, Math.round(height / 2) * 2);
  const fx = Math.min(1, Math.max(0, options?.focalX ?? 0.5));
  const fy = Math.min(1, Math.max(0, options?.focalY ?? 0.5));

  let geometry: string[];
  if (fit === "exact") {
    geometry = options?.assumeExactSize
      ? []
      : [`scale=${w}:${h}:flags=lanczos`];
  } else if (fit === "contain") {
    geometry = [
      `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos`,
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
    ];
  } else {
    // Cover: scale up to fill, then crop. Bias crop toward focal point so
    // faces stay in frame when portrait media fills a landscape canvas.
    const cropX = `max(0\\,min(in_w-${w}\\,in_w*${fx.toFixed(4)}-${w}/2))`;
    const cropY = `max(0\\,min(in_h-${h}\\,in_h*${fy.toFixed(4)}-${h}/2))`;
    geometry = [
      `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${w}:${h}:${cropX}:${cropY}`,
    ];
  }

  const base = [...geometry, "setsar=1", "format=yuv420p"].join(",");
  if (fps && fps > 0) {
    return `${base},fps=${fps}`;
  }
  return base;
}

/** Professional open/close visual fades (not a title card). */
export const MOVIE_OPEN_FADE_MS = 900;
export const MOVIE_CLOSE_FADE_MS = 1200;

/**
 * Append fade-in at t=0 and fade-out at the end of the timeline.
 * Keeps fades short; clamps so they never dominate a brief movie.
 */
export function appendVideoEdgeFades(
  vf: string,
  durationSeconds: number,
  options?: { fadeInMs?: number; fadeOutMs?: number },
): string {
  const dur = Math.max(0.5, durationSeconds);
  const fadeIn = Math.min(
    (options?.fadeInMs ?? MOVIE_OPEN_FADE_MS) / 1000,
    dur / 3,
  );
  const fadeOut = Math.min(
    (options?.fadeOutMs ?? MOVIE_CLOSE_FADE_MS) / 1000,
    dur / 3,
  );
  const fadeOutStart = Math.max(0, dur - fadeOut);
  const parts = [vf];
  if (fadeIn > 0.05) {
    parts.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  }
  if (fadeOut > 0.05) {
    parts.push(
      `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    );
  }
  return parts.join(",");
}

/**
 * libx264 + Rec.709 tagging + VBV ceiling for social-friendly MP4s.
 */
export function buildLibx264EncodeArgs(
  spec: Pick<
    MovieOutputSpec,
    "x264Preset" | "crf" | "profile" | "level" | "maxrate" | "bufsize"
  >,
): string[] {
  return [
    "-c:v",
    "libx264",
    "-preset",
    spec.x264Preset,
    "-crf",
    String(spec.crf),
    "-profile:v",
    spec.profile,
    "-level",
    spec.level,
    "-pix_fmt",
    "yuv420p",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-color_range",
    "tv",
    "-maxrate",
    spec.maxrate,
    "-bufsize",
    spec.bufsize,
    "-movflags",
    "+faststart",
  ];
}

/**
 * Near-lossless intermediate encode for photo-run segments that will be
 * concatenated and re-encoded once more (edge fades / mix). Keeps generation
 * loss off the final social delivery.
 */
export function buildLibx264IntermediateEncodeArgs(
  spec: Pick<
    MovieOutputSpec,
    "x264Preset" | "crf" | "profile" | "level" | "maxrate" | "bufsize"
  >,
): string[] {
  const intermediateCrf = Math.max(10, Math.min(spec.crf, spec.crf - 4));
  const preset =
    spec.x264Preset === "veryfast" || spec.x264Preset === "faster"
      ? "faster"
      : spec.x264Preset;
  return buildLibx264EncodeArgs({
    ...spec,
    crf: intermediateCrf,
    x264Preset: preset,
    // Headroom for the second pass — VBV still applies on the final encode.
    maxrate: spec.maxrate,
    bufsize: spec.bufsize,
  });
}
