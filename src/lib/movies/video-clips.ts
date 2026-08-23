/**
 * Memory video clips for movie exports — duration caps + ffmpeg normalize.
 *
 * Photos stay on the Ken Burns JPEG path; videos are trimmed/scaled to match
 * the movie output canvas, then concat'd with photo segments.
 */

import { join } from "node:path";
import { guessVideoExtension } from "@/lib/media/ffmpeg";
import type { MovieOutputSpec } from "@/lib/movies/output";
import { buildEncodeVideoFilter, buildLibx264EncodeArgs } from "@/lib/movies/output";

/** Cap long phone videos so one clip doesn't dominate the movie. */
export const MAX_VIDEO_CLIP_MS = 20_000;
export const MAX_VIDEO_CLIP_MS_FAST = 12_000;
export const MIN_VIDEO_CLIP_MS = 1_500;

/**
 * How long a memory video plays in the export.
 * Prefer source duration when known; otherwise ~2× still pacing.
 */
export function resolveVideoClipDurationMs(input: {
  sourceDurationMs?: number | null;
  photoDurationMs: number;
  fast?: boolean;
}): number {
  const maxMs = input.fast ? MAX_VIDEO_CLIP_MS_FAST : MAX_VIDEO_CLIP_MS;
  const fallback = Math.max(
    MIN_VIDEO_CLIP_MS,
    Math.round((input.photoDurationMs || 3200) * 2),
  );
  const source =
    input.sourceDurationMs && input.sourceDurationMs > 0
      ? Math.round(input.sourceDurationMs)
      : fallback;
  return Math.min(maxMs, Math.max(MIN_VIDEO_CLIP_MS, source));
}

export function isMovieVideoMedia(row: {
  type?: string | null;
  contentType?: string | null;
}): boolean {
  return (
    row.type === "video" ||
    Boolean(row.contentType?.toLowerCase().startsWith("video/"))
  );
}

/**
 * ffmpeg args: trim + fill-frame crop to movie canvas, silent (music mixed later).
 * Portrait clips zoom/crop into landscape — no letterboxing.
 */
export function buildNormalizeVideoClipArgs(input: {
  inputPath: string;
  outputPath: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  output: Pick<
    MovieOutputSpec,
    "x264Preset" | "crf" | "profile" | "level" | "maxrate" | "bufsize"
  >;
  /** Face / smart-crop focal point (0–1). Defaults to center. */
  focalX?: number;
  focalY?: number;
}): string[] {
  const durationSec = Math.max(0.5, input.durationMs / 1000);
  const vf = buildEncodeVideoFilter(input.width, input.height, input.fps, "cover", {
    focalX: input.focalX,
    focalY: input.focalY,
  });
  return [
    "-y",
    "-i",
    input.inputPath,
    "-t",
    durationSec.toFixed(3),
    "-vf",
    vf,
    "-an",
    ...buildLibx264EncodeArgs(input.output),
    input.outputPath,
  ];
}

export function videoWorkFilenames(
  workDir: string,
  mediaId: string,
  contentType?: string | null,
): { rawPath: string; segmentPath: string; ext: string } {
  const safeId = mediaId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "clip";
  const ext = guessVideoExtension(contentType, null);
  return {
    ext,
    rawPath: join(workDir, `video_src_${safeId}.${ext}`),
    segmentPath: join(workDir, `video_seg_${safeId}.mp4`),
  };
}
