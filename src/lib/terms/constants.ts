/**
 * Terms of Service acceptance gate.
 * Disable anytime with TERMS_REQUIRED=false (or unset).
 */

import { TERMS_OF_SERVICE_VERSION } from "@/content/legal/terms-of-service";

/** Current Terms document version — bump when the legal text changes. */
export const TERMS_VERSION = TERMS_OF_SERVICE_VERSION;

/** httpOnly cookie mirrors DB acceptance for this version (supplement). */
export const TERMS_COOKIE = "fmv_terms";

export function isTermsRequired(): boolean {
  const raw = process.env.TERMS_REQUIRED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
