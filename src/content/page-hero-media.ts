/**
 * Authenticated app page-hero registry — Modern full-bleed headers.
 *
 * Overwrite files under `/public/app-heroes/` in place; paths stay stable.
 * Prefer warm, premium photography with soft left/bottom space for light type.
 */

export type PageHeroSlotId =
  | "dashboard"
  | "media"
  | "memories"
  | "people"
  | "movies"
  | "assistant"
  | "documents"
  | "legacy"
  | "family"
  | "settings"
  | "upload"
  | "billing"
  | "notifications"
  | "emergency";

export type PageHeroMediaSlot = {
  id: PageHeroSlotId;
  /** Public path — replace the file, keep this string */
  image: `/app-heroes/${PageHeroSlotId}.jpg`;
  alt: string;
  /** Mood + shot guidance for future art direction */
  recommend: string;
  purpose: string;
};

export const PAGE_HERO_MEDIA = {
  dashboard: {
    id: "dashboard",
    image: "/app-heroes/dashboard.jpg",
    alt: "Warm family gathering in soft evening light by the water",
    purpose: "Home of memories — welcome back",
    recommend:
      "Warm family / home-of-memories still. Soft left third for title. Avoid harsh flash stock.",
  },
  media: {
    id: "media",
    image: "/app-heroes/media.jpg",
    alt: "Printed photos and a camera on a warm wooden table",
    purpose: "Photo library / camera-roll feeling",
    recommend:
      "Camera-roll / print-stack mood. Shallow depth, honey light, room for type on the left.",
  },
  memories: {
    id: "memories",
    image: "/app-heroes/memories.jpg",
    alt: "Family gathered warmly around a shared meal",
    purpose: "Albums, storytelling, scrapbook mood",
    recommend:
      "Intimate storytelling still — albums, gatherings, scrapbook warmth.",
  },
  people: {
    id: "people",
    image: "/app-heroes/people.jpg",
    alt: "Close, affectionate family faces in soft window light",
    purpose: "Portraits / faces / relationships",
    recommend:
      "Gentle portrait / relationship moment. Soft faces, not clinical headshots.",
  },
  movies: {
    id: "movies",
    image: "/app-heroes/movies.jpg",
    alt: "Children playing outdoors in living cinematic light",
    purpose: "Cinematic stills / filmstrip mood",
    recommend:
      "Motion-friendly cinematic still. Slight filmic grade; keep faces friendly.",
  },
  assistant: {
    id: "assistant",
    image: "/app-heroes/assistant.jpg",
    alt: "Quiet study desk with warm lamp light suggesting discovery",
    purpose: "Helpful, intelligent, discovery mood",
    recommend:
      "Calm intelligence — soft desk/lamp discovery mood, never cold tech neon.",
  },
  documents: {
    id: "documents",
    image: "/app-heroes/documents.jpg",
    alt: "Friends gathered quietly in warm evening light",
    purpose: "Calm, secure, organized vault mood",
    recommend:
      "Secure-but-warm vault mood. Quiet light, organized calm, readable left veil.",
  },
  legacy: {
    id: "legacy",
    image: "/app-heroes/legacy.jpg",
    alt: "Parents walking with children through soft outdoor light",
    purpose: "Peaceful, respectful, soft light",
    recommend:
      "Peaceful dusk-adjacent light. Respectful, never somber or clinical.",
  },
  family: {
    id: "family",
    image: "/app-heroes/family.jpg",
    alt: "Family sharing a quiet, joyful moment together",
    purpose: "Togetherness / shared household",
    recommend:
      "Inclusive togetherness — shared household warmth, open composition.",
  },
  settings: {
    id: "settings",
    image: "/app-heroes/settings.jpg",
    alt: "Calm minimal interior with soft morning light",
    purpose: "Clean, calm, minimal premium",
    recommend:
      "Minimal premium interior. Soft morning light, uncluttered, quiet luxury.",
  },
  upload: {
    id: "upload",
    image: "/app-heroes/upload.jpg",
    alt: "Printed photos and a camera ready for new memories",
    purpose: "Add photos — inviting camera-roll mood",
    recommend:
      "Welcoming upload mood — camera/prints, soft light, open left for type.",
  },
  billing: {
    id: "billing",
    image: "/app-heroes/billing.jpg",
    alt: "Calm minimal interior suggesting clarity and care",
    purpose: "Plans & usage — clean, trustworthy calm",
    recommend:
      "Quiet premium still. Clear, uncluttered, never salesy or corporate stock.",
  },
  notifications: {
    id: "notifications",
    image: "/app-heroes/notifications.jpg",
    alt: "Quiet desk light suggesting gentle updates",
    purpose: "Inbox — calm, helpful awareness",
    recommend:
      "Soft discovery still — helpful without urgency or alert-red energy.",
  },
  emergency: {
    id: "emergency",
    image: "/app-heroes/emergency.jpg",
    alt: "Soft outdoor light — respectful care for loved ones",
    purpose: "Emergency access — peaceful, respectful",
    recommend:
      "Same respectful soft light as Digital Legacy. Never alarming or clinical.",
  },
} as const satisfies Record<PageHeroSlotId, PageHeroMediaSlot>;

export type PageHeroMediaKey = keyof typeof PAGE_HERO_MEDIA;

export const PAGE_HERO_SLOTS = Object.values(PAGE_HERO_MEDIA);

export function getPageHeroMedia(slot: PageHeroSlotId): PageHeroMediaSlot {
  return PAGE_HERO_MEDIA[slot];
}

/**
 * Shared Modern app footer still — full-bleed atmospheric close.
 * Replace `/public/app-heroes/footer.jpg` in place.
 */
export const APP_FOOTER_MEDIA = {
  id: "footer",
  image: "/app-heroes/footer.jpg",
  alt: "Soft outdoor light — a calm close for the vault",
  purpose: "App-wide cinematic footer atmosphere",
  recommend:
    "Wide, quiet atmospheric still. Soft focus, warm dusk-adjacent light. Room for brand + links with a light veil.",
} as const;
