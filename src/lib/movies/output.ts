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
        x264Preset: "veryfast",
        crf: 21,
        profile: "main",
        level: "4.0",
        fps: 30,
        frameJpegQuality: 94,
        maxrate: "6M",
        bufsize: "12M",
      };
    case "ultra":
      // Premium 4K path — slower encode, higher bit budget.
      return {
        x264Preset: "slow",
        crf: 15,
        profile: "high",
        level: "5.1",
        fps: 30,
        frameJpegQuality: 99,
        maxrate: "45M",
        bufsize: "90M",
      };
    case "standard":
    default:
      // Share-ready 1080p: lower CRF + slow preset for cleaner still motion.
      return {
        x264Preset: "slow",
        crf: 15,
        profile: "high",
        level: "4.1",
        fps: 30,
        // Near-lossless intermediates — JPEG→H.264 is already one generation.
        frameJpegQuality: 99,
        maxrate: "14M",
        bufsize: "28M",
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

/**
 * ffmpeg -vf chain: lanczos scale, even pad, SAR 1, yuv420p, optional fps.
 * Frames are usually exact size; scale/pad remain a safety net for odd edges.
 */
export function buildEncodeVideoFilter(
  width: number,
  height: number,
  fps?: number,
): string {
  // Use the fps *filter* (not output -r) so concat `duration` lines are honored —
  // otherwise zoom can collapse to sampleCount/fps seconds regardless of clip length.
  const base = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
  if (fps && fps > 0) {
    return `${base},fps=${fps}`;
  }
  return base;
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
