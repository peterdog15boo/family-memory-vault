/**
 * Simple Mode — one-click polished slideshow preset for Create Movie.
 * Expert Mode keeps the full CreateMoviePanel controls; both hit the same pipeline.
 */

import type { MovieSettings } from "@/lib/movies/settings";
import { ensureFaceAwareMovieSettings } from "@/lib/movies/settings";
import { getMoviePreset, type MoviePresetId } from "@/lib/movies/presets";

export const SIMPLE_MODE_PRESET_ID = "simple_mode" as const satisfies MoviePresetId;

export type MovieCreateMode = "simple" | "expert";

/** localStorage key — client only. Default new users to Simple. */
export const MOVIE_CREATE_MODE_STORAGE_KEY = "fmv.movieCreateMode";

export function parseMovieCreateMode(
  value: string | null | undefined,
): MovieCreateMode {
  return value === "expert" ? "expert" : "simple";
}

export function readStoredMovieCreateMode(): MovieCreateMode {
  if (typeof window === "undefined") return "simple";
  try {
    return parseMovieCreateMode(
      window.localStorage.getItem(MOVIE_CREATE_MODE_STORAGE_KEY),
    );
  } catch {
    return "simple";
  }
}

export function storeMovieCreateMode(mode: MovieCreateMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MOVIE_CREATE_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore quota / private mode.
  }
}

/**
 * Fixed polished settings for Simple Mode creates.
 * Landscape 1080p, fill-frame crops, soft dissolves, no title card,
 * gentle face-aware motion, soft piano bed.
 */
export function buildSimpleModeSettings(): MovieSettings {
  const preset = getMoviePreset(SIMPLE_MODE_PRESET_ID);
  if (!preset) {
    return ensureFaceAwareMovieSettings({
      includeTitles: false,
      posterStyle: "photo",
      aspectRatio: "16:9",
      qualityMode: "standard",
      transition: "soft_dissolve",
      transitionDurationMs: 900,
      zoomIntensity: "medium",
      zoomDirection: "alternate",
      colorFilter: "warm_family",
      colorFilterIntensity: "subtle",
      filterGrain: false,
      filterVignette: false,
      musicSource: "library",
      musicTrackId: "soft-piano",
      musicSuggestionId: "soft-piano",
      presetId: SIMPLE_MODE_PRESET_ID,
      targetDurationSeconds: 45,
      photoDurationMs: 3600,
    });
  }

  return ensureFaceAwareMovieSettings({
    targetDurationSeconds: preset.targetDurationSeconds,
    photoDurationMs: preset.photoDurationMs,
    transition: preset.transition,
    transitionDurationMs: 900,
    zoomIntensity: preset.zoomIntensity,
    zoomDirection: preset.zoomDirection,
    includeTitles: false,
    posterStyle: "photo",
    aspectRatio: preset.aspectRatio,
    presetId: preset.id,
    qualityMode: preset.qualityMode === "fast" ? "standard" : preset.qualityMode,
    colorFilter: preset.colorFilter,
    colorFilterIntensity: preset.colorFilterIntensity,
    filterGrain: preset.filterGrain,
    filterVignette: preset.filterVignette,
    musicSource: preset.musicSource,
    musicTrackId: preset.musicTrackId,
    musicSuggestionId: preset.musicTrackId,
    musicLabel: null,
    musicUploadKey: null,
    musicVolume: 0.5,
    musicFadeInMs: 1500,
    musicFadeOutMs: 2500,
    musicLoop: true,
    musicAiGenerated: false,
    musicAiProvider: null,
  });
}

/** Format sequential vault titles: Movie 001, Movie 002, … */
export function formatMovieAutoTitle(sequence: number): string {
  const n = Math.max(1, Math.floor(sequence));
  return `Movie ${String(n).padStart(3, "0")}`;
}

/** Parse "Movie 001" / "movie 12" → number, else null. */
export function parseMovieAutoTitleSequence(title: string): number | null {
  const match = /^Movie\s+(\d+)$/i.exec(title.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
