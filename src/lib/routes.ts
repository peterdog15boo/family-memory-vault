/** Default post-auth destination inside the signed-in app. */
export const APP_HOME_PATH = "/dashboard" as const;

/** Public marketing homepage. */
export const MARKETING_HOME_PATH = "/" as const;

/** First-session “Your First Family Movie” ritual (when feature flag is on). */
export const FIRST_FAMILY_MOVIE_PATH = "/first-family-movie" as const;

/**
 * Where Clerk should send users after sign-in / sign-up when no deep link
 * is present. When the first-movie flag is on, prefer the ritual route —
 * it enforces NDA/Terms itself and avoids a blank /dashboard wait.
 */
export function getPostAuthLandingPath(): string {
  const raw =
    process.env.NEXT_PUBLIC_FIRST_FAMILY_MOVIE_ONBOARDING?.trim().toLowerCase();
  const flagOn =
    raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  return flagOn ? FIRST_FAMILY_MOVIE_PATH : APP_HOME_PATH;
}
