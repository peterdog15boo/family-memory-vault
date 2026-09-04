/**
 * Dormant-user detection for soft retention (Ava + weekly email).
 */

import {
  RETENTION_DORMANT_DAYS,
  type RetentionVaultSnapshot,
} from "@/lib/retention/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

export function isOlderThanDays(
  at: Date | string | null | undefined,
  days: number,
  now = new Date(),
): boolean {
  if (!at) return true;
  const d = typeof at === "string" ? new Date(at) : at;
  if (!Number.isFinite(d.getTime())) return true;
  return daysBetween(d, now) >= days;
}

/**
 * Meaningful vault actions in the last N days → not dormant.
 */
export function hasRecentMeaningfulAction(
  snapshot: Pick<RetentionVaultSnapshot, "lastMeaningfulActionAt">,
  now = new Date(),
  days = RETENTION_DORMANT_DAYS,
): boolean {
  const at = snapshot.lastMeaningfulActionAt;
  if (!at) return false;
  return daysBetween(at, now) < days;
}

export function isCompletenessStalled(
  snapshot: Pick<
    RetentionVaultSnapshot,
    "completenessNextId" | "completenessStalledSince"
  >,
  now = new Date(),
  days = RETENTION_DORMANT_DAYS,
): boolean {
  if (!snapshot.completenessNextId || !snapshot.completenessStalledSince) {
    return false;
  }
  return isOlderThanDays(snapshot.completenessStalledSince, days, now);
}

/**
 * Dormant when no meaningful action in 7 days AND any of:
 * - no sign-in (last_active_at) in 7+ days
 * - signed in but idle on vault actions (implied by no meaningful action)
 * - completeness journey stalled on the same step 7+ days
 *
 * Recent meaningful action always wins (not dormant).
 */
export function isUserDormant(
  snapshot: RetentionVaultSnapshot,
  now = new Date(),
): boolean {
  if (hasRecentMeaningfulAction(snapshot, now)) return false;

  const inactiveSignIn = isOlderThanDays(
    snapshot.lastActiveAt,
    RETENTION_DORMANT_DAYS,
    now,
  );
  const idleVault = isOlderThanDays(
    snapshot.lastMeaningfulActionAt,
    RETENTION_DORMANT_DAYS,
    now,
  );
  const stalled = isCompletenessStalled(snapshot, now);

  return inactiveSignIn || idleVault || stalled;
}
