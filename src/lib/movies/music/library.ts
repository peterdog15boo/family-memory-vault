/**
 * Built-in royalty-free movie soundtrack library.
 * Audio files live under public/music/library/ (static preview + ffmpeg mix).
 *
 * Masters: Kevin MacLeod (incompetech.com), CC BY 4.0 — properly licensed
 * for commercial use with attribution (shown in the music picker).
 * Rebuild with: python scripts/generate-library-music.py
 */

export const MUSIC_CATEGORIES = [
  "warm_family",
  "cinematic",
  "holiday",
  "upbeat",
  "soft_piano",
  "memorial_reflective",
  "bright_social",
] as const;

export type MusicCategory = (typeof MUSIC_CATEGORIES)[number];

export const MUSIC_CATEGORY_LABELS: Record<MusicCategory, string> = {
  warm_family: "Warm / Family",
  cinematic: "Cinematic",
  holiday: "Holiday",
  upbeat: "Upbeat",
  soft_piano: "Soft Piano",
  memorial_reflective: "Memorial / Reflective",
  bright_social: "Bright Social",
};

export type MovieLibraryTrack = {
  id: string;
  label: string;
  category: MusicCategory;
  /** Filename under public/music/library/ */
  filename: string;
  /** Approximate duration for UI hints */
  durationSeconds: number;
  /** Short description for the picker */
  blurb: string;
  /** Mood chips shown next to the title */
  moodTags: readonly string[];
  /** Attribution for UI / licenses (CC BY requires credit) */
  attribution: string;
};

/** Curated royalty-free beds — swap masters in place; keep ids stable. */
export const MOVIE_LIBRARY_TRACKS: readonly MovieLibraryTrack[] = [
  // —— Soft Piano ——
  {
    id: "soft-piano",
    label: "Soft Piano",
    category: "soft_piano",
    filename: "soft-piano.mp3",
    durationSeconds: 48,
    blurb: "Intimate piano for quiet family moments",
    moodTags: ["gentle", "intimate", "calm"],
    attribution: "Meditation Impromptu 01 — Kevin MacLeod",
  },
  {
    id: "morning-keys",
    label: "Morning Keys",
    category: "soft_piano",
    filename: "morning-keys.mp3",
    durationSeconds: 48,
    blurb: "Light, hopeful piano bed",
    moodTags: ["hopeful", "light", "tender"],
    attribution: "Dreamy Flashback — Kevin MacLeod",
  },
  {
    id: "quiet-keys",
    label: "Quiet Keys",
    category: "soft_piano",
    filename: "quiet-keys.mp3",
    durationSeconds: 50,
    blurb: "Sparse reflective piano",
    moodTags: ["sparse", "reflective", "soft"],
    attribution: "Gymnopedie No 1 — Kevin MacLeod",
  },

  // —— Warm / Family ——
  {
    id: "gentle-acoustic",
    label: "Gentle Acoustic",
    category: "warm_family",
    filename: "gentle-acoustic.mp3",
    durationSeconds: 48,
    blurb: "Warm acoustic glow for everyday love",
    moodTags: ["warm", "acoustic", "cozy"],
    attribution: "Wholesome — Kevin MacLeod",
  },
  {
    id: "vinyl-soft",
    label: "Vinyl Soft",
    category: "warm_family",
    filename: "vinyl-soft.mp3",
    durationSeconds: 48,
    blurb: "Nostalgic soft lounge glow",
    moodTags: ["nostalgic", "soft", "retro"],
    attribution: "Lobby Time — Kevin MacLeod",
  },
  {
    id: "family-porch",
    label: "Family Porch",
    category: "warm_family",
    filename: "family-porch.mp3",
    durationSeconds: 48,
    blurb: "Easy folk-tinged family warmth",
    moodTags: ["folk", "easy", "homey"],
    attribution: "Easy Lemon — Kevin MacLeod",
  },

  // —— Cinematic ——
  {
    id: "quiet-score",
    label: "Quiet Score",
    category: "cinematic",
    filename: "quiet-score.mp3",
    durationSeconds: 50,
    blurb: "Understated film underscore",
    moodTags: ["filmic", "restrained", "score"],
    attribution: "Virtutes Instrumenti — Kevin MacLeod",
  },
  {
    id: "ambient-pads",
    label: "Ambient Pads",
    category: "cinematic",
    filename: "ambient-pads.mp3",
    durationSeconds: 50,
    blurb: "Spacious cinematic atmosphere",
    moodTags: ["atmospheric", "wide", "pad"],
    attribution: "Floating Cities — Kevin MacLeod",
  },
  {
    id: "film-rise",
    label: "Film Rise",
    category: "cinematic",
    filename: "film-rise.mp3",
    durationSeconds: 52,
    blurb: "Slow-building tribute energy",
    moodTags: ["building", "tribute", "dramatic"],
    attribution: "Ascending the Vale — Kevin MacLeod",
  },

  // —— Holiday ——
  {
    id: "festive-strings",
    label: "Festive Strings",
    category: "holiday",
    filename: "festive-strings.mp3",
    durationSeconds: 45,
    blurb: "Classic holiday sparkle",
    moodTags: ["festive", "sparkle", "classic"],
    attribution: "Dance of the Sugar Plum Fairy — Kevin MacLeod",
  },
  {
    id: "carol-lite",
    label: "Carol Lite",
    category: "holiday",
    filename: "carol-lite.mp3",
    durationSeconds: 45,
    blurb: "Soft festive carol",
    moodTags: ["carol", "gentle", "winter"],
    attribution: "Silent Night — Kevin MacLeod",
  },
  {
    id: "holiday-glow",
    label: "Holiday Glow",
    category: "holiday",
    filename: "holiday-glow.mp3",
    durationSeconds: 46,
    blurb: "Bright merry gathering energy",
    moodTags: ["merry", "bright", "gathering"],
    attribution: "Holiday Weasel — Kevin MacLeod",
  },

  // —— Upbeat ——
  {
    id: "light-ukulele",
    label: "Light Breeze",
    category: "upbeat",
    filename: "light-ukulele.mp3",
    durationSeconds: 42,
    blurb: "Bright and breezy celebration",
    moodTags: ["breezy", "playful", "sunny"],
    attribution: "Beachfront Celebration — Kevin MacLeod",
  },
  {
    id: "upbeat-pop",
    label: "Upbeat Pop",
    category: "upbeat",
    filename: "upbeat-pop.mp3",
    durationSeconds: 40,
    blurb: "Cheerful celebration energy",
    moodTags: ["cheerful", "party", "fun"],
    attribution: "Happy Boy Theme — Kevin MacLeod",
  },
  {
    id: "sunny-stride",
    label: "Sunny Stride",
    category: "upbeat",
    filename: "sunny-stride.mp3",
    durationSeconds: 44,
    blurb: "Jaunty feel-good walking beat",
    moodTags: ["jaunty", "feel-good", "lively"],
    attribution: "Jaunty Gumption — Kevin MacLeod",
  },

  // —— Memorial / Reflective ——
  {
    id: "soft-farewell",
    label: "Soft Farewell",
    category: "memorial_reflective",
    filename: "soft-farewell.mp3",
    durationSeconds: 52,
    blurb: "Tender memorial underscore",
    moodTags: ["tender", "memorial", "quiet"],
    attribution: "Past Sadness — Kevin MacLeod",
  },
  {
    id: "long-memory",
    label: "Long Memory",
    category: "memorial_reflective",
    filename: "long-memory.mp3",
    durationSeconds: 55,
    blurb: "Slow reflective pads",
    moodTags: ["reflective", "slow", "spacious"],
    attribution: "Long Note Two — Kevin MacLeod",
  },
  {
    id: "gentle-goodbye",
    label: "Gentle Goodbye",
    category: "memorial_reflective",
    filename: "gentle-goodbye.mp3",
    durationSeconds: 50,
    blurb: "Bittersweet farewell warmth",
    moodTags: ["bittersweet", "warm", "farewell"],
    attribution: "Bittersweet — Kevin MacLeod",
  },

  // —— Bright Social ——
  {
    id: "social-spark",
    label: "Social Spark",
    category: "bright_social",
    filename: "social-spark.mp3",
    durationSeconds: 42,
    blurb: "Scroll-friendly bright energy",
    moodTags: ["bright", "social", "modern"],
    attribution: "Wallpaper — Kevin MacLeod",
  },
  {
    id: "feed-ready",
    label: "Feed Ready",
    category: "bright_social",
    filename: "feed-ready.mp3",
    durationSeconds: 42,
    blurb: "Carefree vertical-story vibe",
    moodTags: ["carefree", "shareable", "light"],
    attribution: "Carefree — Kevin MacLeod",
  },
  {
    id: "bright-scroll",
    label: "Bright Scroll",
    category: "bright_social",
    filename: "bright-scroll.mp3",
    durationSeconds: 40,
    blurb: "Playful social montage bed",
    moodTags: ["playful", "montage", "up"],
    attribution: "Monkeys Spinning Monkeys — Kevin MacLeod",
  },
] as const;

/** Bump when replacing masters so browsers skip stale preview caches. */
export const LIBRARY_MUSIC_ASSET_VERSION = "3";

export const LIBRARY_MUSIC_LICENSE =
  "Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License https://creativecommons.org/licenses/by/4.0/";

export function getLibraryTrack(
  id: string | null | undefined,
): MovieLibraryTrack | null {
  if (!id?.trim()) return null;
  return MOVIE_LIBRARY_TRACKS.find((t) => t.id === id) ?? null;
}

/** Public URL for browser preview (Next.js static file). */
export function libraryTrackPreviewUrl(track: MovieLibraryTrack): string {
  return `/music/library/${track.filename}?v=${LIBRARY_MUSIC_ASSET_VERSION}`;
}

export function listLibraryTracksByCategory(
  category?: MusicCategory | null,
): MovieLibraryTrack[] {
  if (!category) return [...MOVIE_LIBRARY_TRACKS];
  return MOVIE_LIBRARY_TRACKS.filter((t) => t.category === category);
}

/**
 * Map legacy theme suggestion ids (CreateMoviePanel / themes.ts) onto library tracks.
 */
export function resolveSuggestionToLibraryId(
  suggestionId: string | null | undefined,
): string | null {
  if (!suggestionId?.trim()) return null;
  const map: Record<string, string> = {
    "simple-soft-piano": "soft-piano",
    "simple-acoustic": "gentle-acoustic",
    "holiday-orchestral": "festive-strings",
    "holiday-carol-lite": "carol-lite",
    "cinematic-score": "quiet-score",
    "cinematic-ambient": "ambient-pads",
    "vintage-vinyl": "vinyl-soft",
    "bright-ukulele": "light-ukulele",
    "birthday-upbeat": "upbeat-pop",
    "memorial-soft": "soft-farewell",
    "memorial-reflective": "long-memory",
    "social-bright": "social-spark",
  };
  if (map[suggestionId]) return map[suggestionId];
  return getLibraryTrack(suggestionId)?.id ?? null;
}
