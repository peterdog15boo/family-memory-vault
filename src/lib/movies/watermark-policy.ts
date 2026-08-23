/**
 * Plan policy for movie brand watermarks — client-safe (no sharp / Node I/O).
 */

import type { PlanFeatures } from "@/lib/db/schema";

export const MOVIE_WATERMARK_LABEL = "Created with Family Memory Vault";

/**
 * Free plan always shows the soft brand mark.
 * Paid catalogs set `removeMovieWatermark: true` (and known paid slugs
 * default off even if an older DB features blob omits the flag).
 */
export function shouldApplyMovieWatermark(
  planSlug: string | null | undefined,
  features: PlanFeatures | null | undefined,
): boolean {
  const slug = String(planSlug ?? "");
  if (slug === "free") return true;
  const removeFlag = features?.removeMovieWatermark;
  if (removeFlag === true) return false;
  if (slug === "family" || slug === "family_plus" || slug === "legacy") {
    return false;
  }
  // Unknown / custom plans: watermark unless explicitly removed.
  return !removeFlag;
}
