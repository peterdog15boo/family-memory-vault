/**
 * Compose a generation prompt from movie theme/mood + optional user text.
 */

const THEME_MOOD_HINTS: Record<string, string> = {
  simple:
    "warm family photo slideshow, gentle soft piano, intimate and calm, instrumental",
  holiday:
    "festive holiday warmth, soft bells and gentle strings, cozy winter family gathering, instrumental",
  cinematic:
    "cinematic memorial underscore, emotional strings and soft pads, hopeful and reflective, instrumental",
  vintage:
    "nostalgic vintage film score, warm analog piano and light strings, intimate memory reel, instrumental",
  bright:
    "bright uplifting acoustic, light indie folk energy, joyful family moments, instrumental",
  birthday:
    "warm celebratory birthday montage, soft cheerful piano and light percussion, heartfelt joy, instrumental",
};

const ENERGY_BY_THEME: Record<string, string> = {
  simple: "low energy, slow to moderate tempo",
  holiday: "medium energy, warm and sparkling",
  cinematic: "low to medium energy, dramatic but restrained",
  vintage: "low energy, nostalgic waltz feel",
  bright: "medium-high energy, bright and open",
  birthday: "medium energy, smiling and warm",
};

export type BuildAiSoundtrackPromptInput = {
  themeId?: string | null;
  mood?: string | null;
  userPrompt?: string | null;
};

/**
 * Build a single English prompt suitable for ElevenLabs / similar APIs.
 * Always steers toward instrumental movie beds (no lyrics).
 */
export function buildAiSoundtrackPrompt(
  input: BuildAiSoundtrackPromptInput,
): string {
  const themeKey = (input.themeId ?? "simple").trim().toLowerCase() || "simple";
  const themeHint =
    THEME_MOOD_HINTS[themeKey] ??
    "warm family memory film soundtrack, soft instrumental bed";
  const energy =
    ENERGY_BY_THEME[themeKey] ?? "low to medium energy, suitable for photos";

  const mood = input.mood?.trim();
  const user = input.userPrompt?.trim();

  const parts = [
    "Instrumental background music for a private family memory movie.",
    "No vocals, no lyrics, no speech.",
    themeHint + ".",
    energy + ".",
  ];

  if (mood) {
    parts.push(`Mood: ${mood}.`);
  }
  if (user) {
    parts.push(`User direction: ${user}.`);
  }

  parts.push(
    "Clean mix suitable for underscoring photos and video clips; avoid sudden drops or harsh peaks.",
  );

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Display label for UI / movie settings (always marks AI origin). */
export function buildAiSoundtrackLabel(userPrompt?: string | null): string {
  const hint = userPrompt?.trim().slice(0, 48);
  if (hint) {
    return `AI-generated soundtrack · ${hint}`;
  }
  return "AI-generated soundtrack";
}
