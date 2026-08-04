/**
 * Cinematic media overlays & layout tokens for MediaSection.
 * Prefer these for new sections; treatments map onto the same overlay ids.
 */

export const MEDIA_OVERLAYS = {
  /** Strong dark veil — light text over photo/video */
  dark: {
    label: "Dark",
    className: "media-section-overlay--dark",
  },
  /** Soft dark veil — readable without crushing media */
  "dark-soft": {
    label: "Dark soft",
    className: "media-section-overlay--dark-soft",
  },
  /** Strong light/canvas veil — dark ink over media */
  light: {
    label: "Light",
    className: "media-section-overlay--light",
  },
  /** Soft light veil — warm product default */
  "light-soft": {
    label: "Light soft",
    className: "media-section-overlay--light-soft",
  },
  /** Full-viewport cinematic hero — centered readability */
  "hero-cinematic": {
    label: "Hero cinematic",
    className: "media-section-overlay--hero-cinematic",
  },
  /** Landing hero — left + bottom readability */
  "hero-veil": {
    label: "Hero veil",
    className: "media-section-overlay--hero-veil",
  },
  /** Split / dual-side fade for story bands */
  "dual-fade": {
    label: "Dual fade",
    className: "media-section-overlay--dual-fade",
  },
  /** Centered mist for promise / trust */
  "center-veil": {
    label: "Center veil",
    className: "media-section-overlay--center-veil",
  },
  /** Closing CTA glow */
  "cta-glow": {
    label: "CTA glow",
    className: "media-section-overlay--cta-glow",
  },
  /** Onboarding welcome */
  "welcome-veil": {
    label: "Welcome veil",
    className: "media-section-overlay--welcome-veil",
  },
  /** Digital Legacy */
  "legacy-veil": {
    label: "Legacy veil",
    className: "media-section-overlay--legacy-veil",
  },
} as const;

export type MediaOverlayId = keyof typeof MEDIA_OVERLAYS;

export const MEDIA_LAYOUTS = {
  /** Content centered in the stage */
  center: "media-section-layout--center",
  /** Content toward the start (left in LTR) */
  "split-start": "media-section-layout--split-start",
  /** Content toward the end (right in LTR) */
  "split-end": "media-section-layout--split-end",
  /** Content anchored to the bottom — cinematic hero feel */
  bottom: "media-section-layout--bottom",
  /** Stretch content to fill the section (auth shells, custom stages) */
  fill: "media-section-layout--fill",
} as const;

export type MediaLayoutId = keyof typeof MEDIA_LAYOUTS;

export type MediaType = "image" | "video" | "none";

export function getMediaOverlayClass(id: MediaOverlayId): string {
  return MEDIA_OVERLAYS[id].className;
}

export function getMediaLayoutClass(id: MediaLayoutId): string {
  return MEDIA_LAYOUTS[id];
}

export function isMediaOverlayId(value: string): value is MediaOverlayId {
  return value in MEDIA_OVERLAYS;
}
