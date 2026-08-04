/**
 * Cinematic color filter presets for movie exports.
 * Resolved into ThemeColorGrade and applied by effects.ts (sharp) — not CSS-only.
 */

import type { ThemeColorGrade, Rgb } from "@/lib/movies/themes";

export const COLOR_FILTERS = [
  "clean",
  "warm_family",
  "golden_hour",
  "teal_orange",
  "vintage_film",
  "soft_glow",
  "black_white",
  "holiday_bright",
  "dreamy_pastel",
] as const;
export type ColorFilterId = (typeof COLOR_FILTERS)[number];

export const COLOR_FILTER_INTENSITIES = ["subtle", "medium", "strong"] as const;
export type ColorFilterIntensity = (typeof COLOR_FILTER_INTENSITIES)[number];

export type ColorFilterDefinition = {
  id: ColorFilterId;
  label: string;
  hint: string;
  /** Full-strength grade (intensity 1.0). */
  grade: ThemeColorGrade;
};

const IDENTITY_GRADE: ThemeColorGrade = {
  label: "identity",
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
};

function rgb(r: number, g: number, b: number): Rgb {
  return { r, g, b };
}

/** Catalog shown in Create Movie + used by the renderer. */
export const COLOR_FILTER_CATALOG: readonly ColorFilterDefinition[] = [
  {
    id: "clean",
    label: "Clean / Natural",
    hint: "True-to-life",
    grade: {
      ...IDENTITY_GRADE,
      label: "clean-natural",
      brightness: 1.02,
      saturation: 0.98,
      contrast: 1.03,
      grain: 0,
    },
  },
  {
    id: "warm_family",
    label: "Warm Family",
    hint: "Cozy skin tones",
    grade: {
      ...IDENTITY_GRADE,
      label: "warm-family",
      brightness: 1.05,
      saturation: 1.06,
      hue: 4,
      tint: rgb(255, 186, 140),
      tintOpacity: 0.1,
      contrast: 1.05,
      vignette: true,
      vignetteStrength: 0.28,
      grain: 0.02,
      lightLeak: 0.08,
      glow: 0.06,
    },
  },
  {
    id: "golden_hour",
    label: "Golden Hour",
    hint: "Sunset warmth",
    grade: {
      ...IDENTITY_GRADE,
      label: "golden-hour",
      brightness: 1.08,
      saturation: 1.12,
      hue: 8,
      tint: rgb(255, 170, 90),
      tintOpacity: 0.14,
      contrast: 1.08,
      vignette: true,
      vignetteStrength: 0.36,
      grain: 0.05,
      lightLeak: 0.28,
      glow: 0.12,
      shadowTint: rgb(40, 30, 70),
      shadowTintOpacity: 0.08,
    },
  },
  {
    id: "teal_orange",
    label: "Cinematic Teal-Orange",
    hint: "Blockbuster grade",
    grade: {
      ...IDENTITY_GRADE,
      label: "teal-orange",
      brightness: 0.98,
      saturation: 1.1,
      hue: -6,
      tint: rgb(255, 140, 70),
      tintOpacity: 0.09,
      contrast: 1.18,
      vignette: true,
      vignetteStrength: 0.48,
      grain: 0.08,
      lightLeak: 0.1,
      shadowTint: rgb(20, 90, 110),
      shadowTintOpacity: 0.16,
    },
  },
  {
    id: "vintage_film",
    label: "Vintage Film",
    hint: "Sepia reel",
    grade: {
      ...IDENTITY_GRADE,
      label: "vintage-film",
      brightness: 0.96,
      saturation: 0.72,
      hue: 12,
      tint: rgb(190, 150, 95),
      tintOpacity: 0.22,
      contrast: 1.12,
      vignette: true,
      vignetteStrength: 0.55,
      grain: 0.22,
      lightLeak: 0.14,
    },
  },
  {
    id: "soft_glow",
    label: "Soft Glow",
    hint: "Dreamy bloom",
    grade: {
      ...IDENTITY_GRADE,
      label: "soft-glow",
      brightness: 1.1,
      saturation: 0.95,
      tint: rgb(255, 230, 210),
      tintOpacity: 0.08,
      contrast: 0.92,
      vignette: true,
      vignetteStrength: 0.22,
      grain: 0.03,
      lightLeak: 0.06,
      glow: 0.28,
    },
  },
  {
    id: "black_white",
    label: "Black & White",
    hint: "Classic mono",
    grade: {
      ...IDENTITY_GRADE,
      label: "black-white",
      brightness: 1.04,
      saturation: 0,
      contrast: 1.22,
      vignette: true,
      vignetteStrength: 0.42,
      grain: 0.14,
    },
  },
  {
    id: "holiday_bright",
    label: "Holiday Bright",
    hint: "Festive pop",
    grade: {
      ...IDENTITY_GRADE,
      label: "holiday-bright",
      brightness: 1.1,
      saturation: 1.22,
      hue: 3,
      tint: rgb(255, 200, 160),
      tintOpacity: 0.08,
      contrast: 1.1,
      vignette: false,
      vignetteStrength: 0.2,
      grain: 0.04,
      lightLeak: 0.2,
      glow: 0.1,
    },
  },
  {
    id: "dreamy_pastel",
    label: "Dreamy Pastel",
    hint: "Airy pastels",
    grade: {
      ...IDENTITY_GRADE,
      label: "dreamy-pastel",
      brightness: 1.12,
      saturation: 0.88,
      hue: -4,
      tint: rgb(230, 200, 230),
      tintOpacity: 0.12,
      contrast: 0.88,
      vignette: true,
      vignetteStrength: 0.2,
      grain: 0.03,
      lightLeak: 0.05,
      glow: 0.18,
      shadowTint: rgb(160, 190, 220),
      shadowTintOpacity: 0.06,
    },
  },
] as const;

const FILTER_BY_ID = Object.fromEntries(
  COLOR_FILTER_CATALOG.map((f) => [f.id, f]),
) as Record<ColorFilterId, ColorFilterDefinition>;

export function getColorFilter(id: ColorFilterId): ColorFilterDefinition {
  return FILTER_BY_ID[id] ?? FILTER_BY_ID.clean;
}

export function colorFilterIntensityFactor(
  intensity: ColorFilterIntensity,
): number {
  switch (intensity) {
    case "subtle":
      return 0.55;
    case "strong":
      return 1;
    case "medium":
    default:
      // Medium must read clearly on phone screens / social re-encode.
      return 0.88;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: Rgb | null, b: Rgb | null, t: number): Rgb | null {
  if (!a && !b) return null;
  const aa = a ?? { r: 128, g: 128, b: 128 };
  const bb = b ?? aa;
  return {
    r: Math.round(lerp(aa.r, bb.r, t)),
    g: Math.round(lerp(aa.g, bb.g, t)),
    b: Math.round(lerp(aa.b, bb.b, t)),
  };
}

/** Blend identity → target by t (0–1). */
export function lerpColorGrade(
  from: ThemeColorGrade,
  to: ThemeColorGrade,
  t: number,
): ThemeColorGrade {
  const x = Math.min(1, Math.max(0, t));
  const tintOpacity = lerp(from.tintOpacity, to.tintOpacity, x);
  const shadowOpacity = lerp(
    from.shadowTintOpacity ?? 0,
    to.shadowTintOpacity ?? 0,
    x,
  );
  return {
    label: to.label,
    brightness: lerp(from.brightness, to.brightness, x),
    saturation: lerp(from.saturation, to.saturation, x),
    hue: lerp(from.hue, to.hue, x),
    tint: tintOpacity <= 0.001 ? null : lerpRgb(from.tint, to.tint, x),
    tintOpacity,
    vignette: x >= 0.2 ? to.vignette || from.vignette : from.vignette,
    vignetteStrength: lerp(from.vignetteStrength, to.vignetteStrength, x),
    grain: lerp(from.grain, to.grain, x),
    lightLeak: lerp(from.lightLeak, to.lightLeak, x),
    contrast: lerp(from.contrast, to.contrast, x),
    glow: lerp(from.glow ?? 0, to.glow ?? 0, x),
    shadowTint:
      shadowOpacity <= 0.001
        ? null
        : lerpRgb(from.shadowTint ?? null, to.shadowTint ?? null, x),
    shadowTintOpacity: shadowOpacity,
  };
}

/**
 * Resolve the grade baked into export frames from filter + intensity + toggles.
 * When `filterId` is null, falls back to the theme grade (legacy / API omit).
 */
export function resolveMovieColorGrade(input: {
  themeGrade: ThemeColorGrade;
  filterId: ColorFilterId | null;
  intensity: ColorFilterIntensity;
  /** null = use filter/theme default; false forces off; true forces on. */
  grainEnabled?: boolean | null;
  vignetteEnabled?: boolean | null;
}): ThemeColorGrade {
  const t = colorFilterIntensityFactor(input.intensity);

  let grade: ThemeColorGrade;
  if (input.filterId == null) {
    // Intensity still scales theme grade toward identity when subtle.
    grade = lerpColorGrade(IDENTITY_GRADE, input.themeGrade, t);
  } else {
    const preset = getColorFilter(input.filterId);
    grade = lerpColorGrade(IDENTITY_GRADE, preset.grade, t);
    // Black & white must stay monochrome at every intensity — intensity only
    // scales contrast / grain / vignette (otherwise medium still looks colored).
    if (input.filterId === "black_white") {
      grade = { ...grade, saturation: 0 };
    }
  }

  if (input.grainEnabled === false) {
    grade = { ...grade, grain: 0 };
  } else if (input.grainEnabled === true && grade.grain <= 0) {
    // Opt-in without a grainy filter still gets a light film texture.
    grade = { ...grade, grain: 0.06 };
  }

  if (input.vignetteEnabled === false) {
    grade = { ...grade, vignette: false, vignetteStrength: 0 };
  } else if (input.vignetteEnabled === true && !grade.vignette) {
    grade = {
      ...grade,
      vignette: true,
      vignetteStrength: Math.max(0.28, grade.vignetteStrength || 0.35),
    };
  }

  return grade;
}

export { IDENTITY_GRADE as COLOR_GRADE_IDENTITY };
