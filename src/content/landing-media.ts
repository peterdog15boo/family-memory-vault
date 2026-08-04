/**
 * Landing media registry — photographic + cinematic assets for Modern marketing.
 *
 * Prefer real photography/video from explicit slot filenames under `/public/cinematic/`.
 * These placeholders are intentionally premium enough for review, but easy to replace later.
 */

export type LandingMediaKind =
  | "hero-video"
  | "family-still"
  | "abstract-bg";

export type LandingMediaSlot = {
  id: string;
  kind: LandingMediaKind;
  image: string;
  video?: string | null;
  alt: string;
  recommend: string;
};

/**
 * Canonical public slot paths. Overwrite these files in place later without code changes.
 */
export const LANDING_MEDIA = {
  hero: {
    id: "hero",
    kind: "hero-video",
    image: "/cinematic/hero-background.jpg",
    video: "/cinematic/hero-background.mp4",
    alt: "Family gathered warmly at sunset by the water",
    recommend:
      "Muted 8–15s loop + poster. Warm family/home mood.",
  },
  signIn: {
    id: "sign-in",
    kind: "family-still",
    image: "/cinematic/sign-in-background.jpg",
    video: null,
    alt: "Friends gathered together in warm evening light",
    recommend: "Welcoming sign-in background with open space for a floating auth card.",
  },
  preserve: {
    id: "preserve",
    kind: "family-still",
    image: "/cinematic/section-preserve.jpg",
    video: null,
    alt: "Family gathered warmly around a shared meal",
    recommend: "Warm family still — intimate, unposed.",
  },
  privacy: {
    id: "privacy",
    kind: "family-still",
    image: "/cinematic/section-private.jpg",
    video: null,
    alt: "Friends laughing together in warm evening light",
    recommend: "Quiet, private-feeling photographic moment.",
  },
  movies: {
    id: "movies",
    kind: "family-still",
    image: "/cinematic/section-movies.jpg",
    video: null,
    alt: "Children playing gently outdoors",
    recommend: "Motion-friendly still that suggests living memory.",
  },
  familyShare: {
    id: "family-share",
    kind: "family-still",
    image: "/cinematic/section-family.jpg",
    video: null,
    alt: "Family sharing a quiet, joyful moment",
    recommend: "Inclusive family/memory still.",
  },
  legacy: {
    id: "legacy",
    kind: "family-still",
    image: "/cinematic/section-legacy.jpg",
    video: null,
    alt: "Parents walking with children through soft outdoor light",
    recommend: "Calm dusk-adjacent family moment.",
  },
  trust: {
    id: "trust",
    kind: "family-still",
    image: "/images/hero/frame-c.jpg",
    video: null,
    alt: "Close family moment filled with quiet affection",
    recommend: "Intimate trust-coded still.",
  },
  promise: {
    id: "promise",
    kind: "family-still",
    image: "/cinematic/section-preserve.jpg",
    video: null,
    alt: "Family gathered in warm light",
    recommend: "Emotional still with room for large type.",
  },
  finalCta: {
    id: "final-cta",
    kind: "family-still",
    image: "/cinematic/section-final-cta.jpg",
    video: null,
    alt: "Warm invitation — friends in evening light",
    recommend: "Inviting photographic close.",
  },
} as const satisfies Record<string, LandingMediaSlot>;

export type LandingMediaSlotId = keyof typeof LANDING_MEDIA;

export const LANDING_MEDIA_SLOTS = Object.values(LANDING_MEDIA);

export const LANDING_MEDIA_KIND_GUIDE: Record<
  LandingMediaKind,
  { label: string; description: string }
> = {
  "hero-video": {
    label: "Hero background video",
    description:
      "Full-viewport muted loop behind the brand + headline. Always ship a poster.",
  },
  "family-still": {
    label: "Family / memory still",
    description:
      "Photographic moments for full-bleed stages — intimate, unposed, readable under veils.",
  },
  "abstract-bg": {
    label: "Soft abstract / emotional background",
    description: "Out-of-focus light fields when photography is unavailable.",
  },
};
