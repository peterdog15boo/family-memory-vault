import { z } from "zod";
import type { ZoomDirectionMode } from "@/lib/movies/motion";

/**
 * Preferences stored on movies.settings (JSONB).
 * Keep additive — unknown keys are preserved by callers when merging.
 */

/**
 * Clip-to-clip transition styles (baked into export frames).
 * `fade` = through black; `slide` = slide left (legacy ids kept).
 */
export const MOVIE_TRANSITIONS = [
  "crossfade",
  "soft_dissolve",
  "soft_cut",
  "fade",
  "fade_white",
  "slide",
  "slide_right",
  "push",
  "zoom_through",
  "blur_dissolve",
  "light_leak",
  "none",
] as const;
export type MovieTransition = (typeof MOVIE_TRANSITIONS)[number];

export const ZOOM_INTENSITIES = ["off", "subtle", "medium", "strong"] as const;
export type ZoomIntensity = (typeof ZOOM_INTENSITIES)[number];

export const ZOOM_DIRECTION_MODES = [
  "alternate",
  "always-in",
  "always-out",
  "off",
] as const satisfies readonly ZoomDirectionMode[];
export type { ZoomDirectionMode };

export const QUALITY_MODES = ["standard", "fast", "ultra"] as const;
export type QualityMode = (typeof QUALITY_MODES)[number];

export {
  COLOR_FILTERS,
  COLOR_FILTER_INTENSITIES,
  type ColorFilterId,
  type ColorFilterIntensity,
} from "@/lib/movies/filters";
import type {
  ColorFilterId,
  ColorFilterIntensity,
} from "@/lib/movies/filters";
import { COLOR_FILTERS, COLOR_FILTER_INTENSITIES } from "@/lib/movies/filters";

export const MUSIC_SOURCES = ["none", "library", "upload"] as const;
export type MusicSource = (typeof MUSIC_SOURCES)[number];

/** Mirrors schema MOVIE_STYLES — kept local to avoid circular imports. */
export const MOVIE_STYLE_OPTIONS = [
  "simple",
  "holiday",
  "cinematic",
  "vintage",
  "bright",
  "birthday",
] as const;

export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type MovieAspectRatio = (typeof ASPECT_RATIOS)[number];

export const movieSettingsSchema = z.object({
  targetDurationSeconds: z.number().min(5).max(600).optional(),
  photoDurationMs: z.number().int().min(1000).max(15000).optional(),
  /** When omitted, renderer uses the theme default transition. */
  transition: z.enum(MOVIE_TRANSITIONS).nullable().optional(),
  /** Optional override for transition length (ms). null → theme default. */
  transitionDurationMs: z
    .number()
    .int()
    .min(100)
    .max(3000)
    .nullable()
    .optional(),
  /** @deprecated Prefer musicUploadKey — kept for older clients. */
  musicMediaId: z.string().min(1).nullable().optional(),
  /** Legacy mood / suggestion id — also accepted as library track id. */
  musicSuggestionId: z.string().min(1).nullable().optional(),
  /** none | library | upload */
  musicSource: z.enum(MUSIC_SOURCES).optional(),
  /** Built-in library track id */
  musicTrackId: z.string().min(1).max(80).nullable().optional(),
  /** R2 key under movies/{userId}/music/ */
  musicUploadKey: z.string().min(1).max(512).nullable().optional(),
  /** Display label for selected track */
  musicLabel: z.string().trim().min(1).max(120).nullable().optional(),
  /** 0–1 linear gain applied during mix */
  musicVolume: z.number().min(0).max(1).optional(),
  musicFadeInMs: z.number().int().min(0).max(10000).optional(),
  musicFadeOutMs: z.number().int().min(0).max(15000).optional(),
  musicLoop: z.boolean().optional(),
  /** True when the attached upload was produced by AI music generation. */
  musicAiGenerated: z.boolean().optional(),
  /** Provider id (e.g. elevenlabs) when musicAiGenerated. */
  musicAiProvider: z.string().min(1).max(40).nullable().optional(),
  includeTitles: z.boolean().optional(),
  /**
   * titled = share poster with title overlay (default).
   * photo = face-aware Ken Burns still only (Ask AI / photo-first cards).
   */
  posterStyle: z.enum(["photo", "titled"]).optional(),
  aspectRatio: z.enum(ASPECT_RATIOS).optional(),
  zoomIntensity: z.enum(ZOOM_INTENSITIES).optional(),
  zoomDirection: z.enum(ZOOM_DIRECTION_MODES).optional(),
  presetId: z.string().min(1).nullable().optional(),
  /** standard = 1080p, fast = quicker 720p, ultra = 4K (plan-gated). */
  qualityMode: z.enum(QUALITY_MODES).optional(),
  /**
   * Cinematic color filter baked into export frames.
   * null → use theme color grade (legacy).
   */
  colorFilter: z.enum(COLOR_FILTERS).nullable().optional(),
  colorFilterIntensity: z.enum(COLOR_FILTER_INTENSITIES).optional(),
  /** null = filter default; false/true force grain off/on. Default off for clean exports. */
  filterGrain: z.boolean().nullable().optional(),
  /** null = filter default; false/true force vignette off/on. */
  filterVignette: z.boolean().nullable().optional(),
});

export type MovieSettings = z.infer<typeof movieSettingsSchema>;

export type NormalizedMovieSettings = {
  targetDurationSeconds: number;
  photoDurationMs: number;
  /** null → use theme.transition.style */
  transition: MovieTransition | null;
  transitionDurationMs: number | null;
  musicMediaId: string | null;
  musicSuggestionId: string | null;
  musicSource: MusicSource;
  musicTrackId: string | null;
  musicUploadKey: string | null;
  musicLabel: string | null;
  musicVolume: number;
  musicFadeInMs: number;
  musicFadeOutMs: number;
  musicLoop: boolean;
  musicAiGenerated: boolean;
  musicAiProvider: string | null;
  includeTitles: boolean;
  posterStyle: "photo" | "titled";
  aspectRatio: MovieAspectRatio;
  zoomIntensity: ZoomIntensity;
  zoomDirection: ZoomDirectionMode;
  presetId: string | null;
  qualityMode: QualityMode;
  /** null → theme color grade */
  colorFilter: ColorFilterId | null;
  colorFilterIntensity: ColorFilterIntensity;
  filterGrain: boolean | null;
  filterVignette: boolean | null;
};

export const DEFAULT_MOVIE_SETTINGS: NormalizedMovieSettings = {
  targetDurationSeconds: 45,
  photoDurationMs: 3200,
  transition: null,
  transitionDurationMs: null,
  musicMediaId: null,
  musicSuggestionId: null,
  musicSource: "none",
  musicTrackId: null,
  musicUploadKey: null,
  musicLabel: null,
  musicVolume: 0.55,
  musicFadeInMs: 1500,
  musicFadeOutMs: 2500,
  musicLoop: true,
  musicAiGenerated: false,
  musicAiProvider: null,
  includeTitles: true,
  posterStyle: "titled",
  aspectRatio: "16:9",
  zoomIntensity: "medium",
  zoomDirection: "alternate",
  presetId: null,
  qualityMode: "standard",
  colorFilter: "clean",
  colorFilterIntensity: "medium",
  /**
   * null = honor the filter/theme grain amount.
   * false was stripping film grain from every export and made looks feel inert.
   */
  filterGrain: null,
  /** null = honor the filter/theme vignette. */
  filterVignette: null,
};

function inferMusicSource(data: MovieSettings): MusicSource {
  // Explicit library/upload always wins.
  if (data.musicSource === "library" || data.musicSource === "upload") {
    return data.musicSource;
  }
  // Explicit "none" still recovers when a track/upload was left set (UI glitch /
  // partial settings) so we fail-closed toward audible music rather than silence.
  if (data.musicUploadKey || data.musicMediaId) return "upload";
  if (data.musicTrackId || data.musicSuggestionId) return "library";
  if (data.musicSource === "none") return "none";
  return DEFAULT_MOVIE_SETTINGS.musicSource;
}

/**
 * Recover valid fields when full-object Zod parse fails.
 * One bad field (e.g. unknown transition) must never wipe music / zoom.
 */
function pickValidMovieSettingsFields(
  raw: MovieSettings | Record<string, unknown>,
): MovieSettings {
  const shape = movieSettingsSchema.shape;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    if (!(key in raw)) continue;
    const fieldSchema = shape[key];
    const result = fieldSchema.safeParse(
      (raw as Record<string, unknown>)[key as string],
    );
    if (result.success && result.data !== undefined) {
      out[key as string] = result.data;
    }
  }
  return out as MovieSettings;
}

export function normalizeMovieSettings(
  settings: MovieSettings | null | undefined,
): NormalizedMovieSettings {
  const raw = (settings ?? {}) as MovieSettings;
  const parsed = movieSettingsSchema.safeParse(raw);
  const data = parsed.success
    ? parsed.data
    : pickValidMovieSettingsFields(raw);

  if (!parsed.success) {
    console.warn(
      "[movies.settings] Partial normalize — invalid fields ignored",
      {
        issues: parsed.error.issues.slice(0, 8).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
        keptMusicSource: inferMusicSource(data),
        keptMusicTrackId: data.musicTrackId ?? null,
      },
    );
  }

  const musicUploadKey =
    data.musicUploadKey !== undefined
      ? data.musicUploadKey
      : data.musicMediaId !== undefined
        ? data.musicMediaId
        : DEFAULT_MOVIE_SETTINGS.musicUploadKey;

  return {
    targetDurationSeconds:
      data.targetDurationSeconds ?? DEFAULT_MOVIE_SETTINGS.targetDurationSeconds,
    photoDurationMs:
      data.photoDurationMs ?? DEFAULT_MOVIE_SETTINGS.photoDurationMs,
    transition:
      data.transition === undefined
        ? DEFAULT_MOVIE_SETTINGS.transition
        : data.transition,
    transitionDurationMs:
      data.transitionDurationMs === undefined
        ? DEFAULT_MOVIE_SETTINGS.transitionDurationMs
        : data.transitionDurationMs,
    musicMediaId:
      data.musicMediaId === undefined
        ? DEFAULT_MOVIE_SETTINGS.musicMediaId
        : data.musicMediaId,
    musicSuggestionId:
      data.musicSuggestionId === undefined
        ? DEFAULT_MOVIE_SETTINGS.musicSuggestionId
        : data.musicSuggestionId,
    musicSource: inferMusicSource(data),
    musicTrackId:
      data.musicTrackId === undefined
        ? DEFAULT_MOVIE_SETTINGS.musicTrackId
        : data.musicTrackId,
    musicUploadKey,
    musicLabel:
      data.musicLabel === undefined
        ? DEFAULT_MOVIE_SETTINGS.musicLabel
        : data.musicLabel,
    musicVolume: data.musicVolume ?? DEFAULT_MOVIE_SETTINGS.musicVolume,
    musicFadeInMs: data.musicFadeInMs ?? DEFAULT_MOVIE_SETTINGS.musicFadeInMs,
    musicFadeOutMs:
      data.musicFadeOutMs ?? DEFAULT_MOVIE_SETTINGS.musicFadeOutMs,
    musicLoop: data.musicLoop ?? DEFAULT_MOVIE_SETTINGS.musicLoop,
    musicAiGenerated:
      data.musicAiGenerated ?? DEFAULT_MOVIE_SETTINGS.musicAiGenerated,
    musicAiProvider:
      data.musicAiProvider === undefined
        ? DEFAULT_MOVIE_SETTINGS.musicAiProvider
        : data.musicAiProvider,
    includeTitles: data.includeTitles ?? DEFAULT_MOVIE_SETTINGS.includeTitles,
    posterStyle: data.posterStyle ?? DEFAULT_MOVIE_SETTINGS.posterStyle,
    aspectRatio: data.aspectRatio ?? DEFAULT_MOVIE_SETTINGS.aspectRatio,
    zoomIntensity: data.zoomIntensity ?? DEFAULT_MOVIE_SETTINGS.zoomIntensity,
    zoomDirection: data.zoomDirection ?? DEFAULT_MOVIE_SETTINGS.zoomDirection,
    presetId:
      data.presetId === undefined
        ? DEFAULT_MOVIE_SETTINGS.presetId
        : data.presetId,
    qualityMode: data.qualityMode ?? DEFAULT_MOVIE_SETTINGS.qualityMode,
    colorFilter:
      data.colorFilter === undefined
        ? DEFAULT_MOVIE_SETTINGS.colorFilter
        : data.colorFilter,
    colorFilterIntensity:
      data.colorFilterIntensity ?? DEFAULT_MOVIE_SETTINGS.colorFilterIntensity,
    filterGrain:
      data.filterGrain === undefined
        ? DEFAULT_MOVIE_SETTINGS.filterGrain
        : data.filterGrain,
    filterVignette:
      data.filterVignette === undefined
        ? DEFAULT_MOVIE_SETTINGS.filterVignette
        : data.filterVignette,
  };
}

/** True when settings intend a soundtrack (library or upload). */
export function movieSettingsRequestMusic(
  settings: Pick<
    NormalizedMovieSettings,
    "musicSource" | "musicTrackId" | "musicUploadKey" | "musicSuggestionId"
  >,
): boolean {
  if (settings.musicSource === "library" || settings.musicSource === "upload") {
    return true;
  }
  return Boolean(
    settings.musicTrackId ||
      settings.musicUploadKey ||
      settings.musicSuggestionId,
  );
}

/**
 * Validate music settings are coherent before create/render.
 * Throws MovieError-compatible message strings via return; callers throw MovieError.
 */
export function validateMovieMusicSettings(
  settings: NormalizedMovieSettings,
): { ok: true } | { ok: false; message: string } {
  if (!movieSettingsRequestMusic(settings)) {
    return { ok: true };
  }

  if (settings.musicSource === "upload") {
    if (!settings.musicUploadKey?.trim()) {
      return {
        ok: false,
        message:
          "Upload music was selected but no music file key is on the movie. Re-upload a track and try again.",
      };
    }
    return { ok: true };
  }

  // library (including inferred from track/suggestion)
  const trackId =
    settings.musicTrackId?.trim() ||
    settings.musicSuggestionId?.trim() ||
    null;
  if (!trackId) {
    return {
      ok: false,
      message:
        "Library music was selected but no track id is saved on the movie. Pick a soundtrack and create again.",
    };
  }
  return { ok: true };
}

/** Multiplier applied to theme kenBurnsZoom. Maps to ~1.0→1.15 at strong. */
export function zoomIntensityFactor(intensity: ZoomIntensity): number {
  switch (intensity) {
    case "off":
      return 0;
    case "subtle":
      return 0.55;
    case "medium":
      return 1;
    case "strong":
      return 1.55;
    default:
      return 1;
  }
}

/**
 * Face-aware Ken Burns motion defaults shared by Memories Create Movie UI
 * and Ask AI movie creation. Never disables zoom/direction (framing needs motion).
 */
export function faceAwareMovieMotionDefaults(): Pick<
  MovieSettings,
  "zoomIntensity" | "zoomDirection" | "photoDurationMs" | "qualityMode"
> {
  return {
    zoomIntensity: "medium",
    zoomDirection: "alternate",
    photoDurationMs: DEFAULT_MOVIE_SETTINGS.photoDurationMs,
    qualityMode: "standard",
  };
}

/**
 * Ensure movie settings keep face-aware Ken Burns enabled.
 * - `off` zoom/direction → panel defaults
 * - `fast` quality → standard (full framing sample path)
 */
export function ensureFaceAwareMovieSettings(
  settings: MovieSettings,
): MovieSettings {
  const defaults = faceAwareMovieMotionDefaults();
  const zoom =
    !settings.zoomIntensity || settings.zoomIntensity === "off"
      ? defaults.zoomIntensity
      : settings.zoomIntensity;
  const direction =
    !settings.zoomDirection || settings.zoomDirection === "off"
      ? defaults.zoomDirection
      : settings.zoomDirection;
  const qualityMode =
    settings.qualityMode === "fast"
      ? defaults.qualityMode
      : (settings.qualityMode ?? defaults.qualityMode);

  return {
    ...settings,
    zoomIntensity: zoom,
    zoomDirection: direction,
    qualityMode,
    photoDurationMs:
      settings.photoDurationMs ?? defaults.photoDurationMs,
  };
}

export const createMovieSettingsInputSchema = movieSettingsSchema.extend({
  style: z.enum(MOVIE_STYLE_OPTIONS).optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

export type CreateMovieSettingsInput = z.infer<
  typeof createMovieSettingsInputSchema
>;
