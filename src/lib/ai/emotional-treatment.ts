/**
 * Emotionally intelligent movie treatment for assistant-created films.
 *
 * Maps tone / qualities / prompt cues → theme, pacing, title, and description.
 * Used by the action execution layer (not a separate render path).
 */

import type { AssistantIntent, AssistantTone } from "@/lib/assistant/types";
import type { ResolvedIntent } from "@/lib/ai/resolve";
import { MOVIE_STYLES, type MovieStyle } from "@/lib/db/schema";
import {
  getMoviePreset,
  type MoviePresetId,
} from "@/lib/movies/presets";
import type { MovieSettings } from "@/lib/movies/settings";

export type EmotionalToneKind =
  | "memorial"
  | "birthday"
  | "celebration"
  | "humor"
  | "cinematic"
  | "simple"
  | "neutral";

export type EmotionalMovieTreatment = {
  kind: EmotionalToneKind;
  style: MovieStyle;
  presetId: MoviePresetId | null;
  settings: MovieSettings;
  /** Short rationale for debugging / future UI. */
  rationale: string;
};

/* -------------------------------------------------------------------------- */
/* Tone detection                                                              */
/* -------------------------------------------------------------------------- */

export function detectEmotionalKind(intent: AssistantIntent): EmotionalToneKind {
  const raw = intent.raw_prompt.toLowerCase();
  const tone = intent.tone;

  if (
    tone === "memorial" ||
    /\b(memorial|tribute|in memory|remembrance|obituar|funeral)\b/.test(raw)
  ) {
    return "memorial";
  }
  if (tone === "birthday" || /\b(birthday|bday|turning\s+\d+)\b/.test(raw)) {
    return "birthday";
  }
  if (
    tone === "celebration" ||
    /\b(celebration|anniversary|wedding|graduation|party)\b/.test(raw)
  ) {
    return "celebration";
  }
  if (
    tone === "humor" ||
    /\b(funny|humor|humour|hilarious|light[- ]?hearted)\b/.test(raw)
  ) {
    return "humor";
  }
  if (tone === "cinematic" || /\b(cinematic|film\s+look)\b/.test(raw)) {
    return "cinematic";
  }
  if (
    tone === "simple" ||
    /\b(simple|clean|basic)\s+slideshow\b/.test(raw) ||
    /\bslideshow\b/.test(raw)
  ) {
    // Bare "slideshow" without emotional cues → clean/simple.
    if (tone === "simple" || /\b(simple|clean)\b/.test(raw)) return "simple";
    if (
      !tone &&
      /\bslideshow\b/.test(raw) &&
      !/\b(memorial|tribute|birthday|celebrat|funny|humor)\b/.test(raw)
    ) {
      return "simple";
    }
  }
  if (tone === "simple") return "simple";
  return "neutral";
}

/* -------------------------------------------------------------------------- */
/* Style + pacing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Choose a strong default movie theme from emotional tone.
 * Explicit theme_preference wins only when it does not fight a memorial/tribute.
 */
export function chooseEmotionalMovieStyle(intent: AssistantIntent): MovieStyle {
  const kind = detectEmotionalKind(intent);
  const pref = intent.theme_preference?.trim().toLowerCase() ?? "";

  // Memorial / tribute always prefer cinematic (warm cinematic tribute).
  if (kind === "memorial") {
    if (pref === "vintage" || pref === "holiday") return pref;
    return "cinematic";
  }

  if (isMovieStyle(pref)) {
    return pref;
  }

  switch (kind) {
    case "birthday":
      // Bright & Airy — warm, lifted, celebratory.
      return "bright";
    case "celebration":
      // Holiday-style warmth for celebrations.
      return "holiday";
    case "humor":
      return "bright";
    case "cinematic":
      return "cinematic";
    case "simple":
      return "simple";
    default:
      return styleFromTone(intent.tone) ?? "simple";
  }
}

/**
 * Full treatment: style + preset + pacing tuned to the emotional intent.
 */
export function resolveEmotionalMovieTreatment(
  intent: AssistantIntent,
): EmotionalMovieTreatment {
  const kind = detectEmotionalKind(intent);
  const style = chooseEmotionalMovieStyle(intent);
  const qualities = normalizeQualities(intent.qualities);

  if (kind === "memorial") {
    return {
      kind,
      style,
      presetId: style === "cinematic" ? "cinematic_tribute" : null,
      settings: memorialSettings(style, qualities),
      rationale: qualities.length
        ? `Memorial tribute with cinematic pacing, highlighting ${qualities.join(" and ")}.`
        : "Memorial tribute with slower cinematic pacing.",
    };
  }

  if (kind === "birthday") {
    return {
      kind,
      style,
      presetId: null,
      settings: celebratoryBrightSettings(style, "birthday"),
      rationale: "Birthday celebration — brighter look, warm upbeat pacing.",
    };
  }

  if (kind === "celebration") {
    return {
      kind,
      style,
      presetId: style === "holiday" ? "holiday_card" : null,
      settings: celebratoryBrightSettings(style, "celebration"),
      rationale: "Celebration — warmer holiday treatment and easy pacing.",
    };
  }

  if (kind === "humor") {
    return {
      kind,
      style,
      presetId: "classic_family",
      settings: settingsFromPreset("classic_family", {
        targetDurationSeconds: 40,
        photoDurationMs: 2800,
        transition: "soft_dissolve",
        zoomIntensity: "medium",
        zoomDirection: "alternate",
        includeTitles: true,
        qualityMode: "standard",
        colorFilter: "golden_hour",
        colorFilterIntensity: "medium",
        filterGrain: null,
        filterVignette: null,
        musicSource: "library",
        musicTrackId: "sunny-stride",
        musicSuggestionId: "sunny-stride",
      }),
      rationale: "Humor-forward — bright look with lively but readable pacing.",
    };
  }

  if (kind === "simple" || kind === "neutral") {
    const presetId: MoviePresetId | null =
      style === "simple" ? "classic_family" : presetForNeutralStyle(style);
    const settings = presetId
      ? settingsFromPreset(presetId)
      : {
          includeTitles: true,
          zoomDirection: "alternate" as const,
        };
    return {
      kind: kind === "simple" ? "simple" : "neutral",
      style,
      presetId,
      settings,
      rationale:
        kind === "simple"
          ? "Simple slideshow — clean theme and gentle pacing."
          : `Default treatment for ${style}.`,
    };
  }

  // cinematic kind
  return {
    kind: "cinematic",
    style: "cinematic",
    presetId: "cinematic_tribute",
    settings: settingsFromPreset("cinematic_tribute"),
    rationale: "Cinematic look requested.",
  };
}

/** When cinematic themes are plan-locked, pick a warm free-tier stand-in. */
export function emotionalStyleFallback(
  preferred: MovieStyle,
  kind: EmotionalToneKind,
): MovieStyle {
  if (kind === "memorial") return "holiday";
  if (kind === "cinematic") return "holiday";
  if (preferred === "vintage") return "holiday";
  return "simple";
}

/* -------------------------------------------------------------------------- */
/* Titles & descriptions                                                       */
/* -------------------------------------------------------------------------- */

export function buildEmotionalTitle(
  intent: AssistantIntent,
  resolved: ResolvedIntent,
): string {
  const suggested = intent.title_suggestion?.trim();
  if (suggested) return truncate(suggested, 200);

  const kind = detectEmotionalKind(intent);
  const who = resolved.matchedPeople[0]?.name ?? intent.people[0];
  const when = resolved.dateFilter?.label ?? intent.date_range?.label;
  const qualities = normalizeQualities(intent.qualities);

  if (kind === "memorial" && who) {
    if (qualities.length >= 2) {
      return truncate(
        `Remembering ${who} — ${titleCase(qualities[0]!)} & ${titleCase(qualities[1]!)}`,
        200,
      );
    }
    if (qualities.length === 1) {
      return truncate(`Remembering ${who} — ${titleCase(qualities[0]!)}`, 200);
    }
    return truncate(`In Memory of ${who}`, 200);
  }

  if (kind === "birthday" && who) {
    return truncate(
      when ? `Happy Birthday, ${who} — ${titleCase(when)}` : `Happy Birthday, ${who}`,
      200,
    );
  }

  if (kind === "celebration" && who) {
    return truncate(
      when ? `${who} — ${titleCase(when)}` : `Celebrating ${who}`,
      200,
    );
  }

  if (kind === "humor" && who) {
    return truncate(`The Lighter Side of ${who}`, 200);
  }

  if (who && when) {
    return truncate(`${who} — ${titleCase(when)}`, 200);
  }
  if (who) return truncate(who, 200);
  if (when) return truncate(titleCase(when), 200);
  if (intent.action === "create_movie") return "Family slideshow";
  return "Family memory";
}

export function buildEmotionalDescription(
  intent: AssistantIntent,
  resolved: ResolvedIntent,
): string | null {
  const kind = detectEmotionalKind(intent);
  const who = resolved.matchedPeople[0]?.name ?? intent.people[0] ?? "them";
  const when = resolved.dateFilter?.label ?? intent.date_range?.label;
  const qualities = normalizeQualities(intent.qualities);
  const qualityPhrase =
    qualities.length === 0
      ? null
      : qualities.length === 1
        ? qualities[0]
        : `${qualities.slice(0, -1).join(", ")} and ${qualities[qualities.length - 1]}`;

  let lead: string | null = null;

  if (kind === "memorial") {
    lead = qualityPhrase
      ? `A cinematic tribute to ${who}, honoring their ${qualityPhrase}.`
      : `A cinematic tribute to ${who} — gathered with care from the photos we love.`;
  } else if (kind === "birthday") {
    lead = when
      ? `A bright celebration of ${who} from ${when}.`
      : `A bright, joyful birthday celebration of ${who}.`;
  } else if (kind === "celebration") {
    lead = when
      ? `Warm moments with ${who} from ${when}.`
      : `A warm celebration of ${who} and the people who love them.`;
  } else if (kind === "humor") {
    lead = qualityPhrase
      ? `A brighter look at ${who}, full of ${qualityPhrase}.`
      : `A brighter, lighter look at ${who}.`;
  } else if (kind === "simple") {
    lead = who
      ? `A clean slideshow of ${who}${when ? ` from ${when}` : ""}.`
      : when
        ? `A clean slideshow from ${when}.`
        : "A clean, simple family slideshow.";
  }

  const parts: string[] = [];
  if (lead) parts.push(lead);
  if (!lead && qualityPhrase) parts.push(`Highlights: ${qualityPhrase}.`);
  if (when && kind === "memorial") parts.push(`Period: ${when}.`);
  if (intent.raw_prompt.trim() && kind !== "memorial") {
    // Keep the original ask for non-memorial albums; memorials stay gentler.
    parts.push(`Request: ${truncate(intent.raw_prompt.trim(), 200)}`);
  }

  return parts.length ? parts.join(" ") : null;
}

/* -------------------------------------------------------------------------- */
/* Settings builders                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Copy full production fields from a named preset (filters, music, aspect,
 * transitions, etc.) so Ask AI movies benefit from the same upgrades as
 * Create Movie presets. Callers may override pacing / zoom for emotional tone.
 */
function settingsFromPreset(
  presetId: MoviePresetId,
  overrides?: Partial<MovieSettings>,
): MovieSettings {
  const preset = getMoviePreset(presetId);
  if (!preset) {
    return { ...(overrides ?? {}) };
  }
  return {
    presetId: preset.id,
    targetDurationSeconds: preset.targetDurationSeconds,
    photoDurationMs: preset.photoDurationMs,
    transition: preset.transition,
    zoomIntensity: preset.zoomIntensity,
    zoomDirection: preset.zoomDirection,
    includeTitles: preset.includeTitles,
    qualityMode: preset.qualityMode,
    aspectRatio: preset.aspectRatio,
    colorFilter: preset.colorFilter,
    colorFilterIntensity: preset.colorFilterIntensity,
    filterGrain: preset.filterGrain,
    filterVignette: preset.filterVignette,
    musicSource: preset.musicSource,
    musicTrackId: preset.musicTrackId,
    musicSuggestionId: preset.musicTrackId,
    musicAiGenerated: false,
    musicAiProvider: null,
    ...(overrides ?? {}),
  };
}

function memorialSettings(
  style: MovieStyle,
  qualities: string[],
): MovieSettings {
  const deeper = qualities.some((q) =>
    /depth|kindness|love|wisdom|faith|gentle/.test(q),
  );
  const withHumor = qualities.some((q) => /humor|humour|joy|laughter/.test(q));

  // Slower holds on top of cinematic tribute production (filter + music + fade).
  const base =
    style === "cinematic"
      ? settingsFromPreset("cinematic_tribute")
      : settingsFromPreset("classic_family", {
          colorFilter: "soft_glow",
          colorFilterIntensity: "medium",
          musicSource: "library",
          musicTrackId: "soft-farewell",
          musicSuggestionId: "soft-farewell",
        });

  return {
    ...base,
    presetId: style === "cinematic" ? "cinematic_tribute" : base.presetId,
    targetDurationSeconds: deeper ? 80 : 70,
    photoDurationMs: deeper ? 5600 : 5200,
    transitionDurationMs: 700,
    zoomIntensity: withHumor ? "medium" : "strong",
    zoomDirection: "alternate",
    includeTitles: true,
    qualityMode: "standard",
  };
}

function celebratoryBrightSettings(
  style: MovieStyle,
  mode: "birthday" | "celebration",
): MovieSettings {
  if (style === "holiday" || mode === "celebration") {
    return settingsFromPreset("holiday_card", {
      photoDurationMs: 3600,
      zoomIntensity: "medium",
      zoomDirection: "alternate",
      includeTitles: true,
      qualityMode: "standard",
    });
  }

  // Bright & Airy birthday — warm look + upbeat library bed (16:9, not story).
  return settingsFromPreset("classic_family", {
    targetDurationSeconds: 45,
    photoDurationMs: 3000,
    transition: "soft_dissolve",
    zoomIntensity: "medium",
    zoomDirection: "alternate",
    includeTitles: true,
    qualityMode: "standard",
    colorFilter: "golden_hour",
    colorFilterIntensity: "medium",
    filterGrain: null,
    filterVignette: null,
    musicSource: "library",
    musicTrackId: "upbeat-pop",
    musicSuggestionId: "upbeat-pop",
  });
}

function presetForNeutralStyle(style: MovieStyle): MoviePresetId | null {
  if (style === "cinematic") return "cinematic_tribute";
  if (style === "holiday") return "holiday_card";
  if (style === "bright") return "clean_slideshow";
  if (style === "simple") return "classic_family";
  return null;
}

function styleFromTone(tone: AssistantTone | undefined): MovieStyle | undefined {
  switch (tone) {
    case "memorial":
      return "cinematic";
    case "birthday":
      return "bright";
    case "celebration":
      return "holiday";
    case "humor":
      return "bright";
    case "cinematic":
      return "cinematic";
    case "simple":
      return "simple";
    default:
      return undefined;
  }
}

function normalizeQualities(qualities: string[] | undefined): string[] {
  if (!qualities?.length) return [];
  const out: string[] = [];
  for (const q of qualities) {
    const cleaned = q.trim().toLowerCase();
    if (!cleaned) continue;
    const normalized = cleaned === "humour" ? "humor" : cleaned;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function isMovieStyle(value: string): value is MovieStyle {
  return (MOVIE_STYLES as readonly string[]).includes(value);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
