/**
 * Account & privacy preferences — Settings + lifecycle email/in-app gating.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  DEFAULT_USER_ACCOUNT_PREFERENCES,
  users,
  type NotificationType,
  type UserAccountPreferences,
} from "@/lib/db/schema";

export {
  DEFAULT_USER_ACCOUNT_PREFERENCES,
  type UserAccountPreferences,
} from "@/lib/db/schema";

export type ResolvedAccountPreferences = Required<UserAccountPreferences>;

/** Keys exposed in Settings UI (booleans only). */
export const ACCOUNT_PREFERENCE_TOGGLE_KEYS = [
  "emailMovieReady",
  "emailFamilyInvite",
  "emailStorageWarnings",
  "inAppMovieReady",
  "inAppFamilyInvite",
  "inAppStorageWarnings",
  "inAppMediaReady",
  "inAppEmergencyAccess",
  "notificationSoundEnabled",
  "productUpdatesEmail",
] as const satisfies readonly (keyof UserAccountPreferences)[];

export type AccountPreferenceToggleKey =
  (typeof ACCOUNT_PREFERENCE_TOGGLE_KEYS)[number];

export function resolveAccountPreferences(
  raw: UserAccountPreferences | null | undefined,
): ResolvedAccountPreferences {
  const out: ResolvedAccountPreferences = {
    ...DEFAULT_USER_ACCOUNT_PREFERENCES,
  };
  if (!raw || typeof raw !== "object") return out;

  for (const key of ACCOUNT_PREFERENCE_TOGGLE_KEYS) {
    const value = raw[key];
    if (typeof value === "boolean") out[key] = value;
  }
  if (typeof raw.lastStorageWarningAt === "string") {
    out.lastStorageWarningAt = raw.lastStorageWarningAt;
  } else if (raw.lastStorageWarningAt === null) {
    out.lastStorageWarningAt = null;
  }
  return out;
}

export function publicAccountPreferences(
  prefs: ResolvedAccountPreferences,
): Pick<ResolvedAccountPreferences, AccountPreferenceToggleKey> {
  const out = {} as Pick<
    ResolvedAccountPreferences,
    AccountPreferenceToggleKey
  >;
  for (const key of ACCOUNT_PREFERENCE_TOGGLE_KEYS) {
    out[key] = prefs[key];
  }
  return out;
}

export async function getAccountPreferences(
  userId: string,
): Promise<ResolvedAccountPreferences> {
  const db = getDb();
  const [row] = await db
    .select({ accountPreferences: users.accountPreferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return resolveAccountPreferences(row?.accountPreferences);
}

export async function updateAccountPreferences(
  userId: string,
  patch: Partial<UserAccountPreferences>,
): Promise<ResolvedAccountPreferences> {
  const current = await getAccountPreferences(userId);
  const next: ResolvedAccountPreferences = { ...current };

  for (const key of ACCOUNT_PREFERENCE_TOGGLE_KEYS) {
    const value = patch[key];
    if (typeof value === "boolean") next[key] = value;
  }
  if (patch.lastStorageWarningAt !== undefined) {
    next.lastStorageWarningAt = patch.lastStorageWarningAt;
  }

  const db = getDb();
  await db
    .update(users)
    .set({
      accountPreferences: next,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return next;
}

export async function userAllowsEmail(
  userId: string,
  kind: "movie_ready" | "family_invite" | "storage_warning",
): Promise<boolean> {
  const prefs = await getAccountPreferences(userId);
  switch (kind) {
    case "movie_ready":
      return prefs.emailMovieReady;
    case "family_invite":
      return prefs.emailFamilyInvite;
    case "storage_warning":
      return prefs.emailStorageWarnings;
    default:
      return true;
  }
}

export async function userAllowsInApp(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  const prefs = await getAccountPreferences(userId);
  switch (type) {
    case "movie_ready":
      return prefs.inAppMovieReady;
    case "family_invite":
      return prefs.inAppFamilyInvite;
    case "storage_warning":
      return prefs.inAppStorageWarnings;
    case "media_ready":
      return prefs.inAppMediaReady;
    case "emergency_access":
      return prefs.inAppEmergencyAccess;
    case "moderation_attention":
      return true;
    default:
      return true;
  }
}
