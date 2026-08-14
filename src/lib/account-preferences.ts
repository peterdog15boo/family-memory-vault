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
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locales";
import { getUserPlan } from "@/lib/plans";
import {
  buildIdleTimeoutPolicy,
  canDisableIdleTimeout,
  type IdleTimeoutPolicy,
} from "@/lib/session/idle-timeout-policy";

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
  "celebrationSoundEnabled",
  "emailMilestoneCelebrations",
  "productUpdatesEmail",
  "idleTimeoutEnabled",
] as const satisfies readonly (keyof UserAccountPreferences)[];

export type AccountPreferenceToggleKey =
  (typeof ACCOUNT_PREFERENCE_TOGGLE_KEYS)[number];

export class IdleTimeoutPreferenceError extends Error {
  readonly code = "idle_timeout_paid_required" as const;

  constructor(message = "Idle timeout can only be disabled on a paid plan.") {
    super(message);
    this.name = "IdleTimeoutPreferenceError";
  }
}

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
  if (isAppLocale(raw.locale)) {
    out.locale = raw.locale;
  } else {
    out.locale = DEFAULT_LOCALE;
  }
  return out;
}

export type PublicAccountPreferences = Pick<
  ResolvedAccountPreferences,
  AccountPreferenceToggleKey
> & {
  locale: string;
};

export function publicAccountPreferences(
  prefs: ResolvedAccountPreferences,
): PublicAccountPreferences {
  const out = {} as Pick<
    ResolvedAccountPreferences,
    AccountPreferenceToggleKey
  >;
  for (const key of ACCOUNT_PREFERENCE_TOGGLE_KEYS) {
    out[key] = prefs[key];
  }
  return {
    ...out,
    locale: isAppLocale(prefs.locale) ? prefs.locale : DEFAULT_LOCALE,
  };
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

/**
 * Resolve idle-timeout policy from prefs + current plan (server-enforced).
 */
export async function getIdleTimeoutPolicyForUser(
  userId: string,
): Promise<IdleTimeoutPolicy> {
  const [prefs, planCtx] = await Promise.all([
    getAccountPreferences(userId),
    getUserPlan(userId),
  ]);
  return buildIdleTimeoutPolicy({
    preferenceEnabled: prefs.idleTimeoutEnabled,
    planSlug: String(planCtx.plan.slug),
  });
}

export async function updateAccountPreferences(
  userId: string,
  patch: Partial<UserAccountPreferences>,
): Promise<ResolvedAccountPreferences> {
  const current = await getAccountPreferences(userId);
  const next: ResolvedAccountPreferences = { ...current };

  for (const key of ACCOUNT_PREFERENCE_TOGGLE_KEYS) {
    if (key === "idleTimeoutEnabled") continue;
    const value = patch[key];
    if (typeof value === "boolean") next[key] = value;
  }

  if (typeof patch.idleTimeoutEnabled === "boolean") {
    if (patch.idleTimeoutEnabled === false) {
      const planCtx = await getUserPlan(userId);
      if (!canDisableIdleTimeout(String(planCtx.plan.slug))) {
        throw new IdleTimeoutPreferenceError();
      }
    }
    next.idleTimeoutEnabled = patch.idleTimeoutEnabled;
  }

  if (patch.lastStorageWarningAt !== undefined) {
    next.lastStorageWarningAt = patch.lastStorageWarningAt;
  }
  if (patch.locale !== undefined) {
    next.locale = isAppLocale(patch.locale) ? patch.locale : DEFAULT_LOCALE;
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
  kind: "movie_ready" | "family_invite" | "storage_warning" | "milestone",
): Promise<boolean> {
  const prefs = await getAccountPreferences(userId);
  switch (kind) {
    case "movie_ready":
      return prefs.emailMovieReady;
    case "family_invite":
      return prefs.emailFamilyInvite;
    case "storage_warning":
      return prefs.emailStorageWarnings;
    case "milestone":
      return prefs.emailMilestoneCelebrations;
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
    case "memory_created":
    case "family_milestone":
    case "legacy_milestone":
      return true;
    case "emergency_access":
      return prefs.inAppEmergencyAccess;
    case "moderation_attention":
      return true;
    default:
      return true;
  }
}
