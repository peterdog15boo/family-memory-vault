/**
 * Memory video clips for movie exports — duration resolution + ffmpeg normalize.
 *
 * Photos stay on the Ken Burns JPEG path; videos keep their natural playable
 * length (safety-capped), then concat with photo segments.
 */

import { join } from "node:path";
import {
  guessVideoExtension,
  parseFfmpegDurationSec,
  runFfmpegCapture,
} from "@/lib/media/ffmpeg";
import type { MovieOutputSpec } from "@/lib/movies/output";
import { buildEncodeVideoFilter, buildLibx264EncodeArgs } from "@/lib/movies/output";

/**
 * Safety ceiling only — home videos should play through.
 * Fast/preview mode uses a shorter ceiling to keep draft renders quick.
 */
export const MAX_VIDEO_CLIP_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_VIDEO_CLIP_MS_FAST = 90_000; // 90 seconds
export const MIN_VIDEO_CLIP_MS = 1_500;

/**
 * How long a memory video plays in the export.
 * Prefer source duration when known; otherwise ~2× still pacing as last resort.
 * Does not force videos onto still-image duration.
 *
 * Optional `maxDurationMs` supports an Expert Mode trim (when provided).
 */
export function resolveVideoClipDurationMs(input: {
  sourceDurationMs?: number | null;
  photoDurationMs: number;
  fast?: boolean;
  /** Explicit Expert Mode trim from the start of the clip. */
  maxDurationMs?: number | null;
}): number {
  const safetyMax = input.fast ? MAX_VIDEO_CLIP_MS_FAST : MAX_VIDEO_CLIP_MS;
  const userMax =
    input.maxDurationMs != null &&
    Number.isFinite(input.maxDurationMs) &&
    input.maxDurationMs > 0
      ? Math.round(input.maxDurationMs)
      : null;
  const maxMs =
    userMax != null ? Math.min(safetyMax, userMax) : safetyMax;

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

/** Previous photo/video in album order (skips title cards). */
export function findPrevMediaClip<T extends { kind: string }>(
  clips: readonly T[],
  clipIdx: number,
): T | null {
  for (let i = clipIdx - 1; i >= 0; i--) {
    const c = clips[i]!;
    if (c.kind === "photo" || c.kind === "video") return c;
  }
  return null;
}

/** Next photo/video in album order (skips title cards). */
export function findNextMediaClip<T extends { kind: string }>(
  clips: readonly T[],
  clipIdx: number,
): T | null {
  for (let i = clipIdx + 1; i < clips.length; i++) {
    const c = clips[i]!;
    if (c.kind === "photo" || c.kind === "video") return c;
  }
  return null;
}

/**
 * Photo↔photo dissolves only when the immediate neighbor is a photo.
 * Videos hard-cut so the still before a video keeps its full hold.
 */
export function photoTransitionWindows(input: {
  clips: ReadonlyArray<{ kind: string }>;
  clipIdx: number;
  transitionMs: number;
}): { leadMs: number; trailMs: number; nextPhoto: boolean } {
  const transitionMs = Math.max(0, input.transitionMs);
  if (transitionMs <= 0) {
    return { leadMs: 0, trailMs: 0, nextPhoto: false };
  }
  const prev = findPrevMediaClip(input.clips, input.clipIdx);
  const next = findNextMediaClip(input.clips, input.clipIdx);
  const leadMs = prev?.kind === "photo" ? transitionMs : 0;
  const trailMs = next?.kind === "photo" ? transitionMs : 0;
  return {
    leadMs,
    trailMs,
    nextPhoto: next?.kind === "photo",
  };
}

/** Probe a local media file with ffmpeg -i (Duration line). */
export async function probeLocalVideoDurationMs(
  ffmpegPath: string,
  inputPath: string,
): Promise<number | null> {
  try {
    const { stderr } = await runFfmpegCapture(ffmpegPath, ["-i", inputPath]);
    const sec = parseFfmpegDurationSec(stderr);
    if (sec == null || !(sec > 0)) return null;
    return Math.max(1, Math.round(sec * 1000));
  } catch {
    return null;
  }
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
