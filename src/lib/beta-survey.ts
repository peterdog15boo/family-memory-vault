/**
 * Temporary beta feedback survey (Google Form).
 * Set NEXT_PUBLIC_BETA_SURVEY_URL to enable; unset to hide all CTAs.
 */

export const BETA_SURVEY_DISMISS_KEY = "fmv.betaSurveyBanner.dismissed";

export function getBetaSurveyUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_BETA_SURVEY_URL?.trim();
  return url || null;
}
