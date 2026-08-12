/**
 * Optional beta survey URL (Google Form) shown as a secondary link in the
 * feedback modal. In-app feedback works without it.
 */
export const BETA_SURVEY_DISMISS_KEY = "fmv.betaSurveyBanner.dismissed";

export function getBetaSurveyUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_BETA_SURVEY_URL?.trim();
  return url || null;
}
