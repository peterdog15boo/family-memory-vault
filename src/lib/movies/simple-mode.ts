/**
 * Simple Mode — one-click polished slideshow preset for Create Movie.
 * Expert Mode keeps the full CreateMoviePanel controls; both hit the same pipeline.
 */

import { MOVIE_LIBRARY_TRACKS } from "@/lib/movies/music/library";
import type { MovieSettings } from "@/lib/movies/settings";
import { ensureFaceAwareMovieSettings } from "@/lib/movies/settings";
import { getMoviePreset, type MoviePresetId } from "@/lib/movies/presets";

export const SIMPLE_MODE_PRESET_ID = "simple_mode" as const satisfies MoviePresetId;

export type MovieCreateMode = "simple" | "expert";

/** localStorage key — client only. Default new users to Simple. */
export const MOVIE_CREATE_MODE_STORAGE_KEY = "fmv.movieCreateMode";

/** Last Simple Mode library track — avoid immediate repeats in the same browser. */
export const SIMPLE_MODE_LAST_MUSIC_TRACK_KEY = "fmv.simpleModeLastMusicTrack";

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

export function readLastSimpleModeMusicTrackId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(SIMPLE_MODE_LAST_MUSIC_TRACK_KEY);
    return id?.trim() || null;
  } catch {
    return null;
  }
}

export function storeLastSimpleModeMusicTrackId(
  trackId: string | null | undefined,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!trackId?.trim()) {
      window.localStorage.removeItem(SIMPLE_MODE_LAST_MUSIC_TRACK_KEY);
      return;
    }
    window.localStorage.setItem(
      SIMPLE_MODE_LAST_MUSIC_TRACK_KEY,
      trackId.trim(),
    );
  } catch {
    // Ignore quota / private mode.
  }
}

export type PickSimpleModeMusicOptions = {
  /** Prefer not to reuse this track when another option exists. */
  excludeTrackId?: string | null;
  /** Restrict to these ids (e.g. files present on disk). Defaults to full library. */
  candidates?: readonly string[] | null;
  /** Injected RNG for tests — returns [0, 1). */
  random?: () => number;
};

/**
 * Pick a random built-in library track for Simple Mode.
 * Returns null when the candidate list is empty (caller should fail soft).
 */
export function pickSimpleModeLibraryTrackId(
  options: PickSimpleModeMusicOptions = {},
): string | null {
  const pool =
    options.candidates != null
      ? [...options.candidates]
      : MOVIE_LIBRARY_TRACKS.map((t) => t.id);

  if (pool.length === 0) return null;

  const exclude = options.excludeTrackId?.trim() || null;
  const filtered =
    exclude && pool.length > 1
      ? pool.filter((id) => id !== exclude)
      : pool;
  const choices = filtered.length > 0 ? filtered : pool;

  const rand = options.random ?? Math.random;
  const index = Math.min(
    choices.length - 1,
    Math.max(0, Math.floor(rand() * choices.length)),
  );
  return choices[index] ?? null;
}

/**
 * Fixed polished settings for Simple Mode creates.
 * Landscape 1080p, fill-frame crops, soft dissolves, no title card,
 * gentle face-aware motion, randomized library music bed.
 */
export function buildSimpleModeSettings(options?: {
  excludeTrackId?: string | null;
  candidates?: readonly string[] | null;
  random?: () => number;
}): MovieSettings {
  const trackId =
    pickSimpleModeLibraryTrackId({
      excludeTrackId: options?.excludeTrackId,
      candidates: options?.candidates,
      random: options?.random,
    }) ?? "soft-piano";

  const musicFields = {
    musicSource: "library" as const,
    musicTrackId: trackId,
    musicSuggestionId: trackId,
    musicVolume: 0.5,
    musicFadeInMs: 800,
    musicFadeOutMs: 1200,
    musicLoop: true,
  };

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
      ...musicFields,
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
    ...musicFields,
    musicLabel: null,
    musicUploadKey: null,
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
