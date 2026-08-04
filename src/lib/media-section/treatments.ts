import type { MediaOverlayId } from "@/lib/media-section/overlays";

/**
 * Approved background treatments for media-backed sections.
 * Keep this list small so marketing / vault surfaces stay visually consistent.
 * Treatments map onto the cinematic MediaSection API (overlay, atmosphere, filter).
 */

export const MEDIA_SECTION_TREATMENTS = {
  /** Landing / promotional hero — left + bottom readability veil */
  heroWarm: {
    label: "Hero warm",
    atmosphere: "warm",
    overlay: "hero-veil" as MediaOverlayId,
    mediaFilter: "soft",
    sheen: false,
  },
  /** Emotional promise — quiet center field */
  promiseQuiet: {
    label: "Promise quiet",
    atmosphere: "mist",
    overlay: "center-veil" as MediaOverlayId,
    mediaFilter: "muted",
    sheen: false,
  },
  /** Soft feature / story band */
  featureSoft: {
    label: "Feature soft",
    atmosphere: "sage",
    overlay: "dual-fade" as MediaOverlayId,
    mediaFilter: "muted",
    sheen: false,
  },
  /** Warm full-bleed media band */
  bandWarm: {
    label: "Band warm",
    atmosphere: "warm",
    overlay: "dual-fade" as MediaOverlayId,
    mediaFilter: "soft",
    sheen: false,
  },
  /** Rose full-bleed media band */
  bandRose: {
    label: "Band rose",
    atmosphere: "rose",
    overlay: "dual-fade" as MediaOverlayId,
    mediaFilter: "soft",
    sheen: false,
  },
  /** Trust / social-proof band */
  trustMist: {
    label: "Trust mist",
    atmosphere: "mist",
    overlay: "center-veil" as MediaOverlayId,
    mediaFilter: "muted",
    sheen: false,
  },
  /** Final CTA / closing invitation */
  ctaGlow: {
    label: "CTA glow",
    atmosphere: "rose",
    overlay: "cta-glow" as MediaOverlayId,
    mediaFilter: "soft",
    sheen: false,
  },
  /** Onboarding welcome moment */
  welcomeSoft: {
    label: "Welcome soft",
    atmosphere: "warm",
    overlay: "welcome-veil" as MediaOverlayId,
    mediaFilter: "soft",
    sheen: false,
  },
  /** Digital Legacy intro */
  legacyDusk: {
    label: "Legacy dusk",
    atmosphere: "legacy",
    overlay: "legacy-veil" as MediaOverlayId,
    mediaFilter: "muted",
    sheen: false,
  },
} as const;

export type MediaSectionTreatmentId = keyof typeof MEDIA_SECTION_TREATMENTS;

export type MediaSectionAtmosphere =
  (typeof MEDIA_SECTION_TREATMENTS)[MediaSectionTreatmentId]["atmosphere"];

export type MediaSectionOverlay =
  (typeof MEDIA_SECTION_TREATMENTS)[MediaSectionTreatmentId]["overlay"];

export type MediaSectionMediaFilter =
  | (typeof MEDIA_SECTION_TREATMENTS)[MediaSectionTreatmentId]["mediaFilter"]
  /** Full photographic clarity — auth / hero when soft filters wash out subjects */
  | "clear";

export function getMediaSectionTreatment(id: MediaSectionTreatmentId) {
  return MEDIA_SECTION_TREATMENTS[id];
}

/** Guidance for asset authors — keep files lean. */
export const MEDIA_SECTION_ASSET_GUIDANCE = {
  image: "Prefer WebP/AVIF under ~250KB; soft family/memory stills, not busy stock.",
  video:
    "Prefer muted looping WebM/MP4 under ~2MB, 720p or less, 8–15s loops; always provide a poster.",
  reducedMotion:
    "Video is disabled when prefers-reduced-motion is set; poster or atmosphere shows instead.",
  api: '<CinematicSection mediaType="video" src="…" poster="…" overlay="dark" layout="center">',
} as const;
