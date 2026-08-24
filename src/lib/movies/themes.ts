import type { MovieStyle } from "@/lib/db/schema";
import type { MovieTransition } from "@/lib/movies/settings";

/**
 * Flexible movie theme system.
 *
 * To add a theme:
 *   1. Call `defineTheme({ ... })` with the fields you care about
 *      (defaults fill the rest — see DEFAULT_THEME_BASE).
 *   2. Add it to `THEME_DEFINITIONS` below.
 *   3. If it is a first-class DB style, also add the id to `MOVIE_STYLES`
 *      in `src/lib/db/schema.ts` (+ a migration for the enum).
 *
 * The generator reads themes only through `resolveMovieTheme` / this module —
 * no pipeline changes needed for palette, pacing, overlays, or music hints.
 */

/* -------------------------------------------------------------------------- */
/* Shared primitives                                                          */
/* -------------------------------------------------------------------------- */

export type MovieThemeId = MovieStyle | (string & {});

export type Rgb = { r: number; g: number; b: number };

export type ThemeTransitionConfig = {
  /** Cut / fade / dissolve / wipe — baked frame transitions. */
  style: MovieTransition;
  /** Crossfade / fade length hint (ms). */
  durationMs: number;
  /** How assertive the transition should feel. */
  intensity: "subtle" | "medium" | "dramatic";
};

export type ThemeTextOverlayRules = {
  /** Opening title card before the first still. */
  showTitleCard: boolean;
  titleCardDurationMs: number;
  /** Show the memory / movie title on the card. */
  showMemoryTitle: boolean;
  /**
   * Extra lines under the title (e.g. “Happy Holidays”).
   * Empty = theme label only when showThemeLabel is true.
   */
  taglines: string[];
  showThemeLabel: boolean;
  /** Burn media captions into stills when present. */
  showCaptions: boolean;
  captionPosition: "bottom" | "top";
  fontFamily: string;
  titleFontSize: number;
  taglineFontSize: number;
  captionFontSize: number;
  /** Primary text fill (CSS / SVG color). */
  fill: string;
  /** Divider / accent line color. */
  accentFill: string;
  captionShadow: boolean;
};

export type ThemeMusicSuggestion = {
  id: string;
  label: string;
  mood: string;
  energy: "low" | "medium" | "high";
  /** Rough tempo hint for future beat-sync. */
  bpmHint?: number;
  /**
   * Placeholder until a stock / licensed library is wired.
   * Not an R2 key — documentation for editors & future pickers.
   */
  placeholderKey: string;
};

export type ThemeMusicConfig = {
  /** Prefer attaching background music when the user hasn’t chosen any. */
  preferMusic: boolean;
  /** Soft duck / volume target (0–1) for future mixer. */
  targetVolume: number;
  suggestions: ThemeMusicSuggestion[];
};

/**
 * Basic color-grade preferences applied by the frame renderer (sharp).
 * Values are intentionally mild — AI / LUT pipelines can replace later.
 * User filter presets (`filters.ts`) resolve into this shape for export.
 */
export type ThemeColorGrade = {
  /** Sharp modulate brightness (1 = unchanged). */
  brightness: number;
  /** Sharp modulate saturation (1 = unchanged). */
  saturation: number;
  /** Sharp modulate hue degrees (0 = unchanged). */
  hue: number;
  /** Optional wash tint composited over the frame. */
  tint: Rgb | null;
  /** Tint opacity 0–1. */
  tintOpacity: number;
  /** Soft vignette (SVG overlay). */
  vignette: boolean;
  /** Vignette darkness 0–1 (default ~0.35 when vignette true). */
  vignetteStrength: number;
  /** Film grain opacity 0–1 (0 = none). */
  grain: number;
  /** Corner light-leak warmth 0–1 (0 = none). */
  lightLeak: number;
  /** Soft contrast lift via linear multiply bias (1 = none). */
  contrast: number;
  /** Soft center glow / bloom opacity 0–1 (0 = none). */
  glow: number;
  /** Cool/shadow wash for split-tone looks (teal-orange, etc.). */
  shadowTint: Rgb | null;
  /** Shadow tint opacity 0–1. */
  shadowTintOpacity: number;
  /** Human-readable grade name for UI / logs. */
  label: string;
};

export type ThemeMotionConfig = {
  /**
   * Baseline interpolated frames per still for Ken Burns.
   * Renderer also scales by clip duration for smoothness.
   */
  /**
   * @deprecated Soft density hint only — zoom always lasts the full clip.
   * Sample count is derived from clip duration × fps in motion.ts.
   */
  kenBurnsFrames: number;
  /** Max zoom factor across the clip (e.g. 0.12 = 1.00→1.12). Duration = clip length. */
  kenBurnsZoom: number;
  /** Default zoom direction strategy (user settings may override). */
  directionMode: "alternate" | "always-in" | "always-out" | "off";
  /** Draw letterbox bars. */
  letterbox: boolean;
  /** Bar height as a fraction of frame height (cinematic ~0.08–0.12). */
  letterboxRatio: number;
};

export type ThemeTimingConfig = {
  /** Default still duration when settings omit photoDurationMs. */
  defaultClipDurationMs: number;
  /** Soft advisory for UI; generator includes all Memory media up to an absolute guard. */
  maxClips: number;
};

export type ThemePalette = {
  background: Rgb;
  accent: Rgb;
};

export type MovieThemeDefinition = {
  id: MovieThemeId;
  label: string;
  description: string;
  palette: ThemePalette;
  timing: ThemeTimingConfig;
  transition: ThemeTransitionConfig;
  text: ThemeTextOverlayRules;
  music: ThemeMusicConfig;
  colorGrade: ThemeColorGrade;
  motion: ThemeMotionConfig;

  /* ---------- Convenience aliases (generator / legacy) ---------- */
  /** @deprecated Prefer palette.background */
  background: Rgb;
  /** @deprecated Prefer palette.accent */
  accent: Rgb;
  /** @deprecated Prefer text.fill */
  titleFill: string;
  /** @deprecated Prefer text.fontFamily */
  titleFontFamily: string;
  /** @deprecated Prefer text.titleFontSize */
  titleFontSize: number;
  /** @deprecated Prefer timing.defaultClipDurationMs */
  defaultPhotoDurationMs: number;
  /** @deprecated Prefer transition.style */
  defaultTransition: MovieTransition;
  /** @deprecated Prefer transition.durationMs */
  transitionDurationMs: number;
  /** @deprecated Prefer text.titleCardDurationMs */
  titleCardDurationMs: number;
  /** @deprecated Prefer motion.kenBurnsFrames */
  kenBurnsFrames: number;
  /** @deprecated Prefer motion.letterbox */
  letterbox: boolean;
  /** @deprecated Prefer timing.maxClips */
  maxClips: number;
};

/* -------------------------------------------------------------------------- */
/* Defaults + defineTheme helper                                              */
/* -------------------------------------------------------------------------- */

const DEFAULT_THEME_BASE = {
  timing: {
    defaultClipDurationMs: 3500,
    maxClips: 40,
  } satisfies ThemeTimingConfig,
  transition: {
    style: "crossfade" as MovieTransition,
    durationMs: 550,
    intensity: "subtle" as const,
  },
  text: {
    showTitleCard: true,
    titleCardDurationMs: 2500,
    showMemoryTitle: true,
    taglines: [] as string[],
    showThemeLabel: true,
    showCaptions: true,
    captionPosition: "bottom" as const,
    fontFamily: "Georgia, 'Times New Roman', serif",
    titleFontSize: 56,
    taglineFontSize: 28,
    captionFontSize: 32,
    fill: "#F5F0E8",
    accentFill: "#E8DCC8",
    captionShadow: true,
  } satisfies ThemeTextOverlayRules,
  music: {
    preferMusic: false,
    targetVolume: 0.55,
    suggestions: [] as ThemeMusicSuggestion[],
  } satisfies ThemeMusicConfig,
  colorGrade: {
    brightness: 1,
    saturation: 1,
    hue: 0,
    tint: null,
    tintOpacity: 0,
    vignette: false,
    vignetteStrength: 0.35,
    grain: 0,
    lightLeak: 0,
    contrast: 1,
    glow: 0,
    shadowTint: null,
    shadowTintOpacity: 0,
    label: "neutral",
  } satisfies ThemeColorGrade,
  motion: {
    kenBurnsFrames: 18,
    kenBurnsZoom: 0.14,
    directionMode: "alternate",
    letterbox: false,
    letterboxRatio: 0.08,
  } satisfies ThemeMotionConfig,
  palette: {
    background: { r: 18, g: 18, b: 20 },
    accent: { r: 232, g: 220, b: 200 },
  } satisfies ThemePalette,
};

type ThemeInput = {
  id: MovieThemeId;
  label: string;
  description: string;
  palette?: Partial<ThemePalette>;
  timing?: Partial<ThemeTimingConfig>;
  transition?: Partial<ThemeTransitionConfig>;
  text?: Partial<ThemeTextOverlayRules>;
  music?: Partial<ThemeMusicConfig>;
  colorGrade?: Partial<ThemeColorGrade>;
  motion?: Partial<ThemeMotionConfig>;
};

/**
 * Build a full theme from a partial definition.
 * Only `id`, `label`, and `description` are required — everything else inherits defaults.
 */
export function defineTheme(input: ThemeInput): MovieThemeDefinition {
  const palette: ThemePalette = {
    ...DEFAULT_THEME_BASE.palette,
    ...input.palette,
  };
  const timing: ThemeTimingConfig = {
    ...DEFAULT_THEME_BASE.timing,
    ...input.timing,
  };
  const transition: ThemeTransitionConfig = {
    ...DEFAULT_THEME_BASE.transition,
    ...input.transition,
  };
  const text: ThemeTextOverlayRules = {
    ...DEFAULT_THEME_BASE.text,
    ...input.text,
    taglines: input.text?.taglines ?? DEFAULT_THEME_BASE.text.taglines,
  };
  const music: ThemeMusicConfig = {
    ...DEFAULT_THEME_BASE.music,
    ...input.music,
    suggestions:
      input.music?.suggestions ?? DEFAULT_THEME_BASE.music.suggestions,
  };
  const colorGrade: ThemeColorGrade = {
    ...DEFAULT_THEME_BASE.colorGrade,
    ...input.colorGrade,
  };
  const motion: ThemeMotionConfig = {
    ...DEFAULT_THEME_BASE.motion,
    ...input.motion,
  };

  return {
    id: input.id,
    label: input.label,
    description: input.description,
    palette,
    timing,
    transition,
    text,
    music,
    colorGrade,
    motion,
    // Aliases — keep generator / callers working during the nested migration
    background: palette.background,
    accent: palette.accent,
    titleFill: text.fill,
    titleFontFamily: text.fontFamily,
    titleFontSize: text.titleFontSize,
    defaultPhotoDurationMs: timing.defaultClipDurationMs,
    defaultTransition: transition.style,
    transitionDurationMs: transition.durationMs,
    titleCardDurationMs: text.titleCardDurationMs,
    kenBurnsFrames: motion.kenBurnsFrames,
    letterbox: motion.letterbox,
    maxClips: timing.maxClips,
  };
}

/* -------------------------------------------------------------------------- */
/* Built-in themes                                                            */
/* -------------------------------------------------------------------------- */

/** Clean / neutral — soft zoom, subtle fade, minimal grade. */
export const SIMPLE_THEME = defineTheme({
  id: "simple",
  label: "Simple / Clean",
  description:
    "Neutral grade, soft continuous zoom, gentle fades — a polished family album feel.",
  palette: {
    background: { r: 18, g: 18, b: 20 },
    accent: { r: 220, g: 214, b: 204 },
  },
  timing: {
    defaultClipDurationMs: 3600,
    maxClips: 40,
  },
  transition: {
    style: "soft_dissolve",
    durationMs: 900,
    intensity: "subtle",
  },
  text: {
    showTitleCard: true,
    titleCardDurationMs: 2200,
    showMemoryTitle: true,
    taglines: [],
    showThemeLabel: false,
    showCaptions: true,
    captionPosition: "bottom",
    fontFamily: "Georgia, 'Times New Roman', serif",
    titleFontSize: 52,
    taglineFontSize: 26,
    captionFontSize: 30,
    fill: "#F5F0E8",
    accentFill: "#D8D0C4",
    captionShadow: true,
  },
  music: {
    preferMusic: false,
    targetVolume: 0.45,
    suggestions: [
      {
        id: "simple-soft-piano",
        label: "Soft Piano",
        mood: "calm, intimate",
        energy: "low",
        bpmHint: 72,
        placeholderKey: "music/placeholders/soft-piano",
      },
      {
        id: "simple-acoustic",
        label: "Gentle Acoustic",
        mood: "warm, understated",
        energy: "low",
        bpmHint: 84,
        placeholderKey: "music/placeholders/gentle-acoustic",
      },
    ],
  },
  colorGrade: {
    label: "clean-neutral",
    brightness: 1.03,
    saturation: 0.96,
    hue: 0,
    tint: null,
    tintOpacity: 0,
    vignette: false,
    vignetteStrength: 0.2,
    grain: 0,
    lightLeak: 0,
    contrast: 1.02,
  },
  motion: {
    kenBurnsFrames: 24,
    kenBurnsZoom: 0.12,
    directionMode: "alternate",
    letterbox: false,
    letterboxRatio: 0.08,
  },
});

/** Warm festive palette — holiday glow, soft light leaks. */
export const HOLIDAY_THEME = defineTheme({
  id: "holiday",
  label: "Holiday / Warm",
  description:
    "Cozy warm grade, light leaks, soft vignette, and festive title overlays.",
  palette: {
    background: { r: 28, g: 12, b: 14 },
    accent: { r: 176, g: 42, b: 42 },
  },
  timing: {
    defaultClipDurationMs: 4000,
    maxClips: 36,
  },
  transition: {
    style: "light_leak",
    durationMs: 700,
    intensity: "medium",
  },
  text: {
    showTitleCard: true,
    titleCardDurationMs: 3000,
    showMemoryTitle: true,
    taglines: ["Happy Holidays", "Warm wishes from our family to yours"],
    showThemeLabel: false,
    showCaptions: true,
    captionPosition: "bottom",
    fontFamily: "Georgia, 'Times New Roman', serif",
    titleFontSize: 56,
    taglineFontSize: 30,
    captionFontSize: 32,
    fill: "#F2E6C8",
    accentFill: "#C9A227",
    captionShadow: true,
  },
  music: {
    preferMusic: true,
    targetVolume: 0.5,
    suggestions: [
      {
        id: "holiday-orchestral",
        label: "Festive Strings",
        mood: "cozy, celebratory",
        energy: "medium",
        bpmHint: 96,
        placeholderKey: "music/placeholders/festive-strings",
      },
      {
        id: "holiday-carol-lite",
        label: "Carol Lite",
        mood: "nostalgic, gentle",
        energy: "low",
        bpmHint: 88,
        placeholderKey: "music/placeholders/carol-lite",
      },
    ],
  },
  colorGrade: {
    label: "warm-festive",
    brightness: 1.05,
    saturation: 1.14,
    hue: 10,
    tint: { r: 255, g: 150, b: 70 },
    tintOpacity: 0.12,
    vignette: true,
    vignetteStrength: 0.42,
    grain: 0.06,
    lightLeak: 0.22,
    contrast: 1.05,
  },
  motion: {
    kenBurnsFrames: 22,
    kenBurnsZoom: 0.13,
    directionMode: "alternate",
    letterbox: false,
    letterboxRatio: 0.08,
  },
});

/** Slower pacing, letterboxing, dramatic filmic grade. */
export const CINEMATIC_THEME = defineTheme({
  id: "cinematic",
  label: "Cinematic",
  description:
    "Letterboxed frames, cooler filmic grade, grain, and slow Ken Burns.",
  palette: {
    background: { r: 0, g: 0, b: 0 },
    accent: { r: 200, g: 180, b: 140 },
  },
  timing: {
    defaultClipDurationMs: 5200,
    maxClips: 28,
  },
  transition: {
    style: "fade",
    durationMs: 900,
    intensity: "dramatic",
  },
  text: {
    showTitleCard: true,
    titleCardDurationMs: 3400,
    showMemoryTitle: true,
    taglines: [],
    showThemeLabel: true,
    showCaptions: false,
    captionPosition: "bottom",
    fontFamily: "Georgia, 'Times New Roman', serif",
    titleFontSize: 48,
    taglineFontSize: 24,
    captionFontSize: 28,
    fill: "#EDE6D9",
    accentFill: "#A89070",
    captionShadow: true,
  },
  music: {
    preferMusic: true,
    targetVolume: 0.6,
    suggestions: [
      {
        id: "cinematic-score",
        label: "Quiet Score",
        mood: "dramatic, reflective",
        energy: "low",
        bpmHint: 68,
        placeholderKey: "music/placeholders/quiet-score",
      },
      {
        id: "cinematic-ambient",
        label: "Ambient Pads",
        mood: "spacious, emotional",
        energy: "low",
        bpmHint: 60,
        placeholderKey: "music/placeholders/ambient-pads",
      },
    ],
  },
  colorGrade: {
    label: "filmic-contrast",
    brightness: 0.94,
    saturation: 0.82,
    hue: -6,
    tint: { r: 35, g: 40, b: 70 },
    tintOpacity: 0.1,
    vignette: true,
    vignetteStrength: 0.5,
    grain: 0.14,
    lightLeak: 0.04,
    contrast: 1.18,
  },
  motion: {
    kenBurnsFrames: 28,
    kenBurnsZoom: 0.12,
    directionMode: "alternate",
    letterbox: true,
    letterboxRatio: 0.1,
  },
});

/** Faded film look — sepia wash, heavy grain, soft vignette. */
export const VINTAGE_THEME = defineTheme({
  id: "vintage",
  label: "Vintage",
  description:
    "Sepia wash, film grain, vignette, and nostalgic fades — like an old family reel.",
  palette: {
    background: { r: 32, g: 24, b: 16 },
    accent: { r: 180, g: 140, b: 90 },
  },
  timing: {
    defaultClipDurationMs: 3800,
    maxClips: 34,
  },
  transition: {
    style: "soft_dissolve",
    durationMs: 750,
    intensity: "medium",
  },
  text: {
    showTitleCard: true,
    titleCardDurationMs: 2800,
    showMemoryTitle: true,
    taglines: ["A look back"],
    showThemeLabel: false,
    showCaptions: true,
    captionPosition: "bottom",
    fontFamily: "Georgia, 'Times New Roman', serif",
    titleFontSize: 50,
    taglineFontSize: 26,
    captionFontSize: 30,
    fill: "#F0E4D0",
    accentFill: "#C4A574",
    captionShadow: true,
  },
  music: {
    preferMusic: true,
    targetVolume: 0.48,
    suggestions: [
      {
        id: "vintage-vinyl",
        label: "Vinyl Scratch Soft",
        mood: "nostalgic, warm",
        energy: "low",
        bpmHint: 78,
        placeholderKey: "music/placeholders/vinyl-soft",
      },
    ],
  },
  colorGrade: {
    label: "sepia-film",
    brightness: 1.02,
    saturation: 0.62,
    hue: 18,
    tint: { r: 210, g: 160, b: 90 },
    tintOpacity: 0.16,
    vignette: true,
    vignetteStrength: 0.55,
    grain: 0.22,
    lightLeak: 0.12,
    contrast: 1.08,
  },
  motion: {
    kenBurnsFrames: 22,
    kenBurnsZoom: 0.12,
    directionMode: "alternate",
    letterbox: false,
    letterboxRatio: 0.08,
  },
});

/** Bright & airy — lifted shadows, soft pastels, airy transitions. */
export const BRIGHT_THEME = defineTheme({
  id: "bright",
  label: "Bright & Airy",
  description:
    "Lifted brightness, soft pastels, light grain — sunny, open, modern.",
  palette: {
    background: { r: 245, g: 242, b: 236 },
    accent: { r: 120, g: 170, b: 190 },
  },
  timing: {
    defaultClipDurationMs: 2800,
    maxClips: 42,
  },
  transition: {
    style: "fade_white",
    durationMs: 400,
    intensity: "subtle",
  },
  text: {
    showTitleCard: true,
    titleCardDurationMs: 2000,
    showMemoryTitle: true,
    taglines: [],
    showThemeLabel: false,
    showCaptions: true,
    captionPosition: "bottom",
    fontFamily: "Georgia, 'Times New Roman', serif",
    titleFontSize: 54,
    taglineFontSize: 26,
    captionFontSize: 30,
    fill: "#3A3834",
    accentFill: "#6A9BB0",
    captionShadow: false,
  },
  music: {
    preferMusic: false,
    targetVolume: 0.5,
    suggestions: [
      {
        id: "bright-ukulele",
        label: "Light Ukulele",
        mood: "cheerful, airy",
        energy: "medium",
        bpmHint: 110,
        placeholderKey: "music/placeholders/light-ukulele",
      },
    ],
  },
  colorGrade: {
    label: "bright-airy",
    brightness: 1.12,
    saturation: 1.05,
    hue: -4,
    tint: { r: 180, g: 220, b: 255 },
    tintOpacity: 0.06,
    vignette: false,
    vignetteStrength: 0.15,
    grain: 0.04,
    lightLeak: 0.08,
    contrast: 0.94,
  },
  motion: {
    kenBurnsFrames: 18,
    kenBurnsZoom: 0.12,
    directionMode: "alternate",
    letterbox: false,
    letterboxRatio: 0.08,
  },
});

/** Celebratory variant — kept for existing movies / invites. */
export const BIRTHDAY_THEME = defineTheme({
  id: "birthday",
  label: "Birthday",
  description: "Bright celebratory slideshow with party-ready overlays.",
  palette: {
    background: { r: 36, g: 20, b: 48 },
    accent: { r: 255, g: 170, b: 80 },
  },
  timing: {
    defaultClipDurationMs: 3600,
    maxClips: 36,
  },
  transition: {
    style: "push",
    durationMs: 500,
    intensity: "medium",
  },
  text: {
    taglines: ["Happy Birthday!", "Make a wish"],
    showThemeLabel: false,
    fill: "#FFF6E8",
    accentFill: "#FFB347",
    titleFontSize: 58,
  },
  music: {
    preferMusic: true,
    targetVolume: 0.55,
    suggestions: [
      {
        id: "birthday-upbeat",
        label: "Upbeat Pop",
        mood: "fun, celebratory",
        energy: "high",
        bpmHint: 120,
        placeholderKey: "music/placeholders/upbeat-pop",
      },
    ],
  },
  colorGrade: {
    label: "bright-party",
    brightness: 1.08,
    saturation: 1.18,
    hue: 12,
    tint: { r: 255, g: 200, b: 120 },
    tintOpacity: 0.08,
    vignette: false,
    vignetteStrength: 0.2,
    grain: 0.05,
    lightLeak: 0.15,
    contrast: 1.06,
  },
  motion: {
    kenBurnsFrames: 18,
    kenBurnsZoom: 0.12,
    directionMode: "alternate",
    letterbox: false,
  },
});

/**
 * Ordered registry. Append new `defineTheme(...)` results here to ship them.
 * First-class DB styles should also be listed in schema `MOVIE_STYLES`.
 */
const BUILTIN_THEMES: MovieThemeDefinition[] = [
  SIMPLE_THEME,
  HOLIDAY_THEME,
  CINEMATIC_THEME,
  VINTAGE_THEME,
  BRIGHT_THEME,
  BIRTHDAY_THEME,
];

/** Live registry (builtins + any `registerMovieTheme` calls). */
const themeRegistry: MovieThemeDefinition[] = [...BUILTIN_THEMES];

const themeById = (): Record<string, MovieThemeDefinition> =>
  Object.fromEntries(themeRegistry.map((theme) => [theme.id, theme]));

/* -------------------------------------------------------------------------- */
/* Lookup API                                                                 */
/* -------------------------------------------------------------------------- */

export function resolveMovieTheme(
  style: MovieStyle | string | null | undefined,
): MovieThemeDefinition {
  const map = themeById();
  if (style && map[style]) {
    return map[style]!;
  }
  return SIMPLE_THEME;
}

export function listMovieThemes(): MovieThemeDefinition[] {
  return [...themeRegistry];
}

export function getMovieThemeIds(): MovieThemeId[] {
  return themeRegistry.map((theme) => theme.id);
}

/**
 * Runtime registration for experiments / plugins.
 * Prefer appending to `BUILTIN_THEMES` for shipped themes.
 */
export function registerMovieTheme(theme: MovieThemeDefinition): void {
  const idx = themeRegistry.findIndex((t) => t.id === theme.id);
  if (idx >= 0) {
    themeRegistry[idx] = theme;
  } else {
    themeRegistry.push(theme);
  }
}

/** Snapshot of built-in themes (excludes runtime registrations). */
export const THEME_DEFINITIONS: readonly MovieThemeDefinition[] = BUILTIN_THEMES;

/** Pick the first music suggestion (placeholder until user/library selection). */
export function suggestThemeMusic(
  theme: MovieThemeDefinition,
): ThemeMusicSuggestion | null {
  return theme.music.suggestions[0] ?? null;
}
