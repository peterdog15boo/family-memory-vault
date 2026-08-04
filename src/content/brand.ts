/**
 * Official Family Memory Vault logos — replace files under `/public/brand/`.
 *
 * - `logo.png` — slate mark on transparent (light surfaces)
 * - `logo-light.jpg` — same mark on light ground (fallback / print-like uses)
 * - Dark photographic surfaces use `logo.png` + `.brand-logo--on-dark` invert
 */

export const BRAND_NAME = "Family Memory Vault";

export const BRAND_LOGO = {
  /** Transparent PNG — preferred for light UI */
  color: "/brand/logo.png",
  /** Light-ground JPG (provided asset; prefer `color` in UI) */
  colorOnLight: "/brand/logo-light.jpg",
  /**
   * Same transparent asset as `color`; rendered white via CSS for dark/photo.
   * Swap this path if you add a true white PNG later.
   */
  onDark: "/brand/logo.png",
} as const;

/** Intrinsic pixel size of the official lockup */
export const BRAND_LOGO_INTRINSIC = {
  width: 712,
  height: 464,
} as const;

export const BRAND_LOGO_ASPECT =
  BRAND_LOGO_INTRINSIC.width / BRAND_LOGO_INTRINSIC.height;

/**
 * Height scale (px). Width follows aspect ratio — never stretch.
 */
export const BRAND_LOGO_SIZES = {
  xs: 26,
  sm: 32,
  md: 40,
  lg: 52,
  xl: 68,
  hero: 88,
} as const;

export type BrandLogoSize = keyof typeof BRAND_LOGO_SIZES;
export type BrandLogoTone = "color" | "onDark";
