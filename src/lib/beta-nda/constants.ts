/**
 * Temporary Beta Tester NDA gate.
 * Disable anytime with BETA_NDA_REQUIRED=false (or unset).
 */

/** Current NDA document version — bump when the legal text changes. */
export const BETA_NDA_VERSION = "v1.0 - August 2026";

/** httpOnly cookie mirrors DB acceptance for this version (supplement). */
export const BETA_NDA_COOKIE = "fmv_beta_nda";

export function isBetaNdaRequired(): boolean {
  const raw = process.env.BETA_NDA_REQUIRED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
