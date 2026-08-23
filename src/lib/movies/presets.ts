/**
 * Named movie presets — set underlying settings only (no separate render path).
 * Create Movie + Ask AI treatments apply these parameters; the generator stays modular.
 */

import type { MovieStyle } from "@/lib/db/schema";
import type { ZoomDirectionMode } from "@/lib/movies/motion";
import type {
  ColorFilterId,
  ColorFilterIntensity,
  MovieAspectRatio,
  MovieTransition,
  MusicSource,
  QualityMode,
  ZoomIntensity,
} from "@/lib/movies/settings";

export type MoviePresetId =
  | "simple_mode"
  | "classic_family"
  | "holiday_card"
  | "cinematic_tribute"
  | "social_story"
  | "clean_slideshow";

/** Legacy ids still resolved by getMoviePreset. */
const PRESET_ALIASES: Record<string, MoviePresetId> = {
  cinematic_story: "cinematic_tribute",
  fast_memories: "clean_slideshow",
  /** Older clean slideshow id used as one-click default before simple_mode. */
  simple: "simple_mode",
};

export type MoviePreset = {
  id: MoviePresetId;
  label: string;
  blurb: string;
  /** Theme / style id for title cards & letterbox — not a separate render path. */
  style: MovieStyle;
  aspectRatio: MovieAspectRatio;
  targetDurationSeconds: number;
  photoDurationMs: number;
  transition: MovieTransition;
  zoomIntensity: ZoomIntensity;
  zoomDirection: ZoomDirectionMode;
  includeTitles: boolean;
  qualityMode: QualityMode;
  colorFilter: ColorFilterId;
  colorFilterIntensity: ColorFilterIntensity;
  filterGrain: boolean | null;
  filterVignette: boolean | null;
  musicSource: MusicSource;
  /** Preferred library track when musicSource is library. */
  musicTrackId: string | null;
};

export const MOVIE_PRESETS: readonly MoviePreset[] = [
  {
    id: "simple_mode",
    label: "Simple",
    blurb: "1080p landscape · fill-frame · soft dissolve · no title card",
    style: "simple",
    aspectRatio: "16:9",
    targetDurationSeconds: 45,
    photoDurationMs: 3600,
    transition: "soft_dissolve",
    zoomIntensity: "medium",
    zoomDirection: "alternate",
    includeTitles: false,
    qualityMode: "standard",
    colorFilter: "warm_family",
    colorFilterIntensity: "subtle",
    filterGrain: false,
    filterVignette: false,
    musicSource: "library",
    musicTrackId: "soft-piano",
  },
  {
    id: "classic_family",
    label: "Classic Family",
    blurb: "16:9 · soft dissolve · warm look",
    style: "simple",
    aspectRatio: "16:9",
    targetDurationSeconds: 45,
    photoDurationMs: 3200,
    transition: "soft_dissolve",
    zoomIntensity: "subtle",
    zoomDirection: "alternate",
    includeTitles: true,
    qualityMode: "standard",
    colorFilter: "warm_family",
    colorFilterIntensity: "medium",
    filterGrain: null,
    filterVignette: null,
    musicSource: "library",
    musicTrackId: "soft-piano",
  },
  {
    id: "holiday_card",
    label: "Holiday Card",
    blurb: "Cozy pacing · light-leak · festive grade",
    style: "holiday",
    aspectRatio: "16:9",
    targetDurationSeconds: 50,
    photoDurationMs: 4000,
    transition: "light_leak",
    zoomIntensity: "medium",
    zoomDirection: "alternate",
    includeTitles: true,
    qualityMode: "standard",
    colorFilter: "holiday_bright",
    colorFilterIntensity: "medium",
    filterGrain: false,
    filterVignette: false,
    musicSource: "library",
    musicTrackId: "festive-strings",
  },
  {
    id: "cinematic_tribute",
    label: "Cinematic Tribute",
    blurb: "Fade through black · teal-orange · strong zoom",
    style: "cinematic",
    aspectRatio: "16:9",
    targetDurationSeconds: 60,
    photoDurationMs: 4800,
    transition: "fade",
    zoomIntensity: "strong",
    zoomDirection: "alternate",
    includeTitles: true,
    qualityMode: "standard",
    colorFilter: "teal_orange",
    colorFilterIntensity: "strong",
    filterGrain: true,
    filterVignette: true,
    musicSource: "library",
    musicTrackId: "ambient-pads",
  },
  {
    id: "social_story",
    label: "Social Story",
    blurb: "9:16 · push · share-ready vertical",
    style: "bright",
    aspectRatio: "9:16",
    targetDurationSeconds: 30,
    photoDurationMs: 2400,
    transition: "push",
    zoomIntensity: "medium",
    zoomDirection: "always-in",
    includeTitles: true,
    qualityMode: "standard",
    colorFilter: "golden_hour",
    colorFilterIntensity: "medium",
    filterGrain: null,
    filterVignette: null,
    musicSource: "library",
    musicTrackId: "social-spark",
  },
  {
    id: "clean_slideshow",
    label: "Clean Slideshow",
    blurb: "Natural look · soft cuts · no title card",
    style: "simple",
    aspectRatio: "16:9",
    targetDurationSeconds: 40,
    photoDurationMs: 2800,
    transition: "soft_cut",
    zoomIntensity: "subtle",
    zoomDirection: "alternate",
    includeTitles: false,
    qualityMode: "standard",
    colorFilter: "clean",
    colorFilterIntensity: "subtle",
    filterGrain: false,
    filterVignette: false,
    musicSource: "none",
    musicTrackId: null,
  },
] as const;

export function resolveMoviePresetId(
  id: string | null | undefined,
): MoviePresetId | null {
  if (!id) return null;
  if (MOVIE_PRESETS.some((p) => p.id === id)) return id as MoviePresetId;
  return PRESET_ALIASES[id] ?? null;
}

export function getMoviePreset(
  id: string | null | undefined,
): MoviePreset | null {
  const resolved = resolveMoviePresetId(id);
  if (!resolved) return null;
  return MOVIE_PRESETS.find((p) => p.id === resolved) ?? null;
}
