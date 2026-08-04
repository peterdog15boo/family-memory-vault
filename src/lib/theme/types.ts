/**
 * App visual theme ids — reversible.
 * Default for new visitors is Modern; saved Original preferences are respected.
 */

export const APP_THEMES = ["modern", "original"] as const;

export type AppTheme = (typeof APP_THEMES)[number];

/** Persisted theme preference (this device only). */
export const APP_THEME_STORAGE_KEY = "fmv-app-theme";

/** Floating Design Preview control dismissed. */
export const THEME_FLOATER_DISMISS_KEY = "fmv-theme-floater-dismissed";

/** Sticky Design Preview banner dismissed while on Modern. */
export const DESIGN_PREVIEW_BANNER_DISMISS_KEY =
  "fmv-design-preview-banner-dismissed";

/** Window event to re-show floater + banner after Settings restores controls. */
export const THEME_PREVIEW_SHOW_EVENT = "fmv-theme-preview-show";

/** Site default when no preference is stored. */
export const APP_THEME_DEFAULT: AppTheme = "modern";

export const APP_THEME_LABELS: Record<AppTheme, string> = {
  original: "Original",
  modern: "Modern",
};

export const APP_THEME_DESCRIPTIONS: Record<AppTheme, string> = {
  modern:
    "The default look — cinematic public pages, premium login, gallery-first home, and a calmer family app shell.",
  original:
    "The familiar warm vault look — paper grain, sage accents, classic display type, and the simpler public landing.",
};

/** Suggested pages to click through while evaluating Modern. */
export const THEME_EVALUATION_PAGES = [
  { href: "/", label: "Landing" },
  { href: "/sign-in", label: "Sign in" },
  { href: "/pricing", label: "Pricing" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/media", label: "Photos" },
  { href: "/memories", label: "Memories" },
  { href: "/people", label: "People" },
  { href: "/movies", label: "Movies" },
  { href: "/assistant", label: "Ask AI" },
  { href: "/documents", label: "Documents" },
  { href: "/documents/legacy", label: "Digital Legacy" },
] as const;

export function isAppTheme(value: unknown): value is AppTheme {
  return (
    typeof value === "string" &&
    (APP_THEMES as readonly string[]).includes(value)
  );
}

export function applyThemeToDocument(theme: AppTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = "light";
}

export function readDomTheme(): AppTheme | null {
  if (typeof document === "undefined") return null;
  const attr = document.documentElement.getAttribute("data-theme");
  return isAppTheme(attr) ? attr : null;
}

export function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return APP_THEME_DEFAULT;
  try {
    const raw = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (isAppTheme(raw)) return raw;
  } catch {
    // private mode / blocked storage
  }
  return APP_THEME_DEFAULT;
}

/** Persist theme for boot script + multi-tab; also mirrors to a cookie for SSR hints. */
export function persistThemePreference(theme: AppTheme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  try {
    document.cookie = `${APP_THEME_STORAGE_KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore
  }
}

/** Clear dismiss flags so Design Preview UI shows again. */
export function resetDesignPreviewControls() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(THEME_FLOATER_DISMISS_KEY);
    window.localStorage.removeItem(DESIGN_PREVIEW_BANNER_DISMISS_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(THEME_PREVIEW_SHOW_EVENT));
}
