/**
 * R2 key helpers for private Will Planner exports (owner-only).
 * Prefix must stay out of gallery download helpers.
 */

import {
  R2_PREFIXES,
  isWillDraftStorageKey,
} from "@/lib/r2";

export function buildWillDraftStorageKey(input: {
  userId: string;
  draftId: string;
  filename: string;
}): string {
  const safe = input.filename.replace(/[^\w.\-]+/g, "_").slice(0, 180);
  return `${R2_PREFIXES.privateLegacyWills}${input.userId}/${input.draftId}/${safe}`;
}

export { isWillDraftStorageKey };
