/** Default post-auth destination inside the signed-in app. */
export const APP_HOME_PATH = "/dashboard" as const;

/** Public marketing homepage. */
export const MARKETING_HOME_PATH = "/" as const;

/** First-session “Your First Family Movie” ritual (when feature flag is on). */
export const FIRST_FAMILY_MOVIE_PATH = "/first-family-movie" as const;

/** Interactive family tree (Family / Legacy+ plans). */
export const FAMILY_TREE_PATH = "/family-tree" as const;

/**
 * Where Clerk should send users after sign-in / sign-up when no deep link
 * is present.
 *
 * Always land on the vault home. Eligible first-movie users are redirected
 * from the authenticated app layout *after* eligibility is computed — never
 * send seasoned accounts to /first-family-movie first (that flashes the
 * ritual loading screen).
 */
export function getPostAuthLandingPath(): string {
  return APP_HOME_PATH;
}

/**
 * Safe in-app destination after auth when a `redirect_url` query may be present.
 * Falls back to the vault home. Never returns another auth URL.
 */
export function resolvePostAuthPath(raw?: string | null): string {
  const fallback = APP_HOME_PATH;
  if (!raw) return fallback;

  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;

  const pathOnly = (trimmed.split("#")[0] ?? trimmed).trim();
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return fallback;

  if (
    pathOnly === "/" ||
    pathOnly.startsWith("/sign-in") ||
    pathOnly.startsWith("/sign-up") ||
    pathOnly.startsWith("/sso-callback")
  ) {
    return fallback;
  }

  return pathOnly;
}
