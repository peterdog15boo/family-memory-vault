/**
 * Rough wall-clock estimates for the crafting UI.
 * Tuned for the current sharp+ffmpeg pipeline after sample-density optimizations.
 */

import type { QualityMode } from "@/lib/movies/settings";

export type MovieRenderEstimate = {
  /** Lower bound seconds */
  minSeconds: number;
  /** Upper bound seconds */
  maxSeconds: number;
  /** Short user-facing label, e.g. "about 1–3 minutes" */
  label: string;
};

/**
 * Estimate render time from photo count + quality.
 * Includes frame render, encode, and optional music mix overhead.
 */
export function estimateMovieRenderTime(input: {
  photoCount: number;
  qualityMode?: QualityMode | null;
  hasMusic?: boolean;
}): MovieRenderEstimate {
  const photos = Math.max(1, input.photoCount);
  const quality = input.qualityMode ?? "standard";

  // Empirically-shaped seconds-per-photo after ~10 Ken Burns samples/clip.
  const perPhoto =
    quality === "fast" ? 4 : quality === "ultra" ? 14 : 8;
  const base = 20; // queue + ffmpeg startup + encode
  const music = input.hasMusic ? 8 : 0;
  const typical = Math.round(base + photos * perPhoto + music);

  const minSeconds = Math.max(30, Math.round(typical * 0.7));
  const maxSeconds = Math.max(minSeconds + 30, Math.round(typical * 1.6));

  return {
    minSeconds,
    maxSeconds,
    label: formatEstimateLabel(minSeconds, maxSeconds),
  };
}

function formatEstimateLabel(minSeconds: number, maxSeconds: number): string {
  const minM = Math.max(1, Math.round(minSeconds / 60));
  const maxM = Math.max(minM, Math.ceil(maxSeconds / 60));
  if (minM === maxM) {
    return minM === 1
      ? "Usually about a minute"
      : `Usually about ${minM} minutes`;
  }
  return `Usually about ${minM}–${maxM} minutes`;
}
