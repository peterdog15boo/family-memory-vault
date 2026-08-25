/**
 * Lifecycle email + in-app notification wiring.
 *
 * Fire-and-forget friendly — helpers catch/log and never throw into callers.
 */

import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { getStorageQuotaForUser } from "@/lib/billing/quotas";
import {
  getUsageLevel,
  type UsageLevel,
} from "@/lib/billing/usage-thresholds";
import { getDb } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import {
  sendFamilyInviteEmail,
  sendMovieReadyEmail,
  sendStorageWarningEmail,
  sendWelcomeEmail,
} from "@/lib/email";
import type { SendEmailResult } from "@/lib/email";
import {
  notifyFamilyInvite,
  notifyMediaReady,
  notifyMovieReady,
  notifyStorageWarning,
} from "@/lib/notifications";
import { emailAppUrl } from "@/lib/email/templates";

export type UserContact = {
  userId: string;
  email: string;
  displayName: string | null;
  firstName: string | null;
};

function firstNameFromDisplay(displayName: string | null | undefined): string | null {
  if (!displayName?.trim()) return null;
  return displayName.trim().split(/\s+/)[0] ?? null;
}

/**
 * Resolve email + name from the app users table (works in workers).
 */
export async function getUserContact(
  userId: string,
): Promise<UserContact | null> {
  if (!userId?.trim()) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.email) return null;
  return {
    userId: row.id,
    email: row.email,
    displayName: row.displayName,
    firstName: firstNameFromDisplay(row.displayName),
  };
}

function safeFire(label: string, work: () => Promise<unknown>): void {
  void work().catch((error) => {
    console.error(`[email.lifecycle] ${label} failed`, error);
  });
}

/* -------------------------------------------------------------------------- */
/* Welcome                                                                     */
/* -------------------------------------------------------------------------- */

export async function sendWelcomeLifecycleEmail(input: {
  email: string;
  firstName?: string | null;
}): Promise<void> {
  const result = await sendWelcomeEmail({
    to: input.email,
    firstName: input.firstName,
  });
  if (!result.ok) {
    console.error("[email.lifecycle] welcome failed", result.error);
  }
}

/** Schedule welcome email without blocking the caller. */
export function queueWelcomeEmail(input: {
  email: string;
  firstName?: string | null;
}): void {
  safeFire("welcome", () => sendWelcomeLifecycleEmail(input));
}

/* -------------------------------------------------------------------------- */
/* Family invite                                                               */
/* -------------------------------------------------------------------------- */

export type FamilyInviteLifecycleResult = {
  /** Result of the invite email send (always attempted — invites are transactional). */
  email: SendEmailResult;
  notifiedInApp: boolean;
};

export async function sendFamilyInviteLifecycle(input: {
  inviteeEmail: string;
  inviteeUserId?: string | null;
  inviterName: string;
  familyId: string;
  familyName: string;
  role?: string | null;
  inviteUrl: string;
  /** Relative app path for in-app notification deep link */
  acceptPath?: string;
}): Promise<FamilyInviteLifecycleResult> {
  // Family invites are transactional: always email the address the owner typed.
  // Preference opt-outs apply to other lifecycle mail, not owner-initiated invites.
  const { resolveUserLocale } = await import("@/lib/i18n/user-locale");
  const locale = await resolveUserLocale(input.inviteeUserId);
  const email = await sendFamilyInviteEmail({
    to: input.inviteeEmail,
    inviterName: input.inviterName,
    familyName: input.familyName,
    role: input.role,
    inviteUrl: input.inviteUrl,
    locale,
  });
  if (!email.ok) {
    console.error(
      "[email.lifecycle] family invite email failed",
      {
        familyId: input.familyId,
        inviteeEmail: input.inviteeEmail,
        error: email.error,
      },
    );
  } else if (email.logged) {
    console.warn(
      "[email.lifecycle] family invite email logged only (RESEND_API_KEY unset)",
      {
        familyId: input.familyId,
        inviteeEmail: input.inviteeEmail,
      },
    );
  }

  let notifiedInApp = false;
  // In-app bell only if invitee already has an account.
  if (input.inviteeUserId) {
    try {
      const { userAllowsEmail } = await import("@/lib/account-preferences");
      const allowNotify = await userAllowsEmail(
        input.inviteeUserId,
        "family_invite",
      );
      if (allowNotify) {
        await notifyFamilyInvite(input.inviteeUserId, {
          familyId: input.familyId,
          familyName: input.familyName,
          inviterName: input.inviterName,
          role: input.role ?? undefined,
          link: input.acceptPath ?? "/family",
        });
        notifiedInApp = true;
      }
    } catch (error) {
      console.error("[email.lifecycle] family invite notification failed", error);
    }
  }

  return { email, notifiedInApp };
}

/** Fire-and-forget wrapper — prefer awaiting `sendFamilyInviteLifecycle` for invites. */
export function queueFamilyInviteLifecycle(
  input: Parameters<typeof sendFamilyInviteLifecycle>[0],
): void {
  safeFire("family_invite", () => sendFamilyInviteLifecycle(input));
}

/* -------------------------------------------------------------------------- */
/* Movie ready                                                                 */
/* -------------------------------------------------------------------------- */

export async function sendMovieReadyLifecycle(input: {
  userId: string;
  movieId: string;
  memoryId?: string | null;
  title: string;
  memoryKind?: import("@/lib/gamification/types").MemoryKind;
  celebration?: import("@/lib/gamification/types").JourneyCelebrationPayload | null;
}): Promise<void> {
  const { userAllowsEmail } = await import("@/lib/account-preferences");
  const contact = await getUserContact(input.userId);
  const { resolveNotificationHref } = await import("@/lib/notifications/links");

  let firstFamilyMovie = false;
  try {
    const { getDb } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const { normalizeOnboardingState } = await import(
      "@/lib/ava/onboarding-state"
    );
    const db = getDb();
    const [row] = await db
      .select({ onboarding: users.onboarding })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    const state = normalizeOnboardingState(row?.onboarding);
    firstFamilyMovie =
      state.firstFamilyMovieId === input.movieId &&
      !state.firstFamilyMovieRevealSeenAt;
  } catch {
    // Non-fatal — fall back to normal movies deep link.
  }

  const appPath = resolveNotificationHref({
    type: "movie_ready",
    metadata: {
      movieId: input.movieId,
      memoryId: input.memoryId ?? undefined,
      firstFamilyMovie,
    },
  });

  try {
    const row = await notifyMovieReady(input.userId, {
      movieId: input.movieId,
      memoryId: input.memoryId ?? undefined,
      title: input.title,
      link: appPath,
      firstFamilyMovie,
      ...(input.celebration ? { celebration: input.celebration } : {}),
    });
    if (!row && input.celebration) {
      const { notifyMemoryCreated } = await import("@/lib/notifications");
      await notifyMemoryCreated(input.userId, {
        memoryId: input.memoryId ?? undefined,
        movieId: input.movieId,
        memoryKind: input.memoryKind ?? "film",
        title: input.title,
        link: appPath,
        celebration: input.celebration,
      });
    }
  } catch (error) {
    console.error("[email.lifecycle] movie ready notification failed", error);
  }

  try {
    const { userAllowsInApp } = await import("@/lib/account-preferences");
    if (await userAllowsInApp(input.userId, "movie_ready")) {
      const { translatorForUserId } = await import("@/lib/i18n/user-locale");
      const { sendWebPushToUser } = await import("@/lib/push/send");
      const { t } = await translatorForUserId(input.userId);
      await sendWebPushToUser({
        userId: input.userId,
        title: t("notifications.movieReady.title"),
        body: input.title
          ? t("notifications.movieReady.messageWithTitle", {
              title: input.title,
            })
          : t("notifications.movieReady.message"),
        href: appPath,
        tag: "fmv-movie-ready",
      });
    }
  } catch (error) {
    console.error("[email.lifecycle] movie ready push failed", error);
  }

  if (!contact) {
    console.warn(
      "[email.lifecycle] movie ready — no email for user",
      input.userId,
    );
    return;
  }

  if (!(await userAllowsEmail(input.userId, "movie_ready"))) return;

  const result = await sendMovieReadyEmail({
    to: contact.email,
    firstName: contact.firstName,
    movieTitle: input.title,
    movieUrl: emailAppUrl(appPath),
  });
  if (!result.ok) {
    console.error("[email.lifecycle] movie ready email failed", result.error);
  }
}

export function queueMovieReadyLifecycle(
  input: Parameters<typeof sendMovieReadyLifecycle>[0],
): void {
  safeFire("movie_ready", () => sendMovieReadyLifecycle(input));
}

/* -------------------------------------------------------------------------- */
/* Storage warning (80% / 100%)                                                */
/* -------------------------------------------------------------------------- */

const STORAGE_WARN_DEDUPE_DAYS = 7;

/**
 * After an upload that increases usage, notify when crossing into warning
 * (80%+) or critical (100%). Dedupes via recent storage_warning notifications.
 */
export async function maybeNotifyStorageThreshold(
  userId: string,
): Promise<void> {
  const snapshot = await getStorageQuotaForUser(userId);
  const level = getUsageLevel(snapshot.percentUsed);
  if (level === "ok" || snapshot.percentUsed == null) return;

  const {
    getAccountPreferences,
    updateAccountPreferences,
    userAllowsEmail,
  } = await import("@/lib/account-preferences");
  const prefs = await getAccountPreferences(userId);
  const allowInApp = prefs.inAppStorageWarnings;
  const allowEmail = prefs.emailStorageWarnings;
  if (!allowInApp && !allowEmail) return;

  const shouldSend = await shouldSendStorageWarning(userId, level, prefs);
  if (!shouldSend) return;

  const contact = await getUserContact(userId);

  if (allowInApp) {
    try {
      await notifyStorageWarning(userId, {
        usedBytes: snapshot.usedBytes,
        limitBytes: snapshot.limitBytes,
        percentUsed: snapshot.percentUsed,
        link: "/billing",
      });
    } catch (error) {
      console.error("[email.lifecycle] storage notification failed", error);
    }
  }

  if (allowEmail && contact) {
    if (await userAllowsEmail(userId, "storage_warning")) {
      const result = await sendStorageWarningEmail({
        to: contact.email,
        firstName: contact.firstName,
        percentUsed: snapshot.percentUsed,
        planName: snapshot.planName,
        usedLabel: snapshot.label,
      });
      if (!result.ok) {
        console.error("[email.lifecycle] storage email failed", result.error);
      }
    }
  }

  await updateAccountPreferences(userId, {
    lastStorageWarningAt: new Date().toISOString(),
  }).catch((error) => {
    console.error("[email.lifecycle] storage pref stamp failed", error);
  });
}

export function queueStorageThresholdCheck(userId: string): void {
  safeFire("storage_warning", () => maybeNotifyStorageThreshold(userId));
}

/* -------------------------------------------------------------------------- */
/* Media ready (in-app only — avoid email spam on every photo)                 */
/* -------------------------------------------------------------------------- */

export async function sendMediaReadyNotification(input: {
  userId: string;
  mediaId: string;
  filename?: string | null;
  celebration?: import("@/lib/gamification/types").JourneyCelebrationPayload | null;
}): Promise<void> {
  try {
    await notifyMediaReady(input.userId, {
      mediaId: input.mediaId,
      filename: input.filename ?? undefined,
      link: "/media",
      ...(input.celebration ? { celebration: input.celebration } : {}),
    });
  } catch (error) {
    console.error("[email.lifecycle] media ready notification failed", error);
  }

  try {
    const { completePhotoRequestsForUploader } = await import(
      "@/lib/photo-requests"
    );
    await completePhotoRequestsForUploader(input.userId);
  } catch (error) {
    console.error("[email.lifecycle] photo request complete failed", error);
  }
}

export function queueMediaReadyNotification(input: {
  userId: string;
  mediaId: string;
  filename?: string | null;
}): void {
  safeFire("media_ready", () => sendMediaReadyNotification(input));
}

async function shouldSendStorageWarning(
  userId: string,
  level: Exclude<UsageLevel, "ok">,
  prefs?: { lastStorageWarningAt?: string | null },
): Promise<boolean> {
  const sinceMs = STORAGE_WARN_DEDUPE_DAYS * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - sinceMs);

  if (prefs?.lastStorageWarningAt) {
    const stamped = new Date(prefs.lastStorageWarningAt).getTime();
    if (Number.isFinite(stamped) && Date.now() - stamped < sinceMs) {
      // Still allow escalation warning → critical inside the window via
      // notification metadata below when an in-app row exists.
    } else if (!Number.isFinite(stamped)) {
      // ignore bad stamp
    } else {
      // stamp older than window — fall through
    }
  }

  const db = getDb();

  const recent = await db
    .select({
      metadata: notifications.metadata,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, "storage_warning"),
        gte(notifications.createdAt, since),
        isNotNull(notifications.createdAt),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(5);

  if (recent.length === 0) {
    if (prefs?.lastStorageWarningAt) {
      const stamped = new Date(prefs.lastStorageWarningAt).getTime();
      if (Number.isFinite(stamped) && Date.now() - stamped < sinceMs) {
        return false;
      }
    }
    return true;
  }

  const lastPct = recent
    .map((r) => {
      const meta = r.metadata as { percentUsed?: number } | null;
      return typeof meta?.percentUsed === "number" ? meta.percentUsed : null;
    })
    .find((n) => n != null);

  if (lastPct == null) return true;

  const lastLevel = getUsageLevel(lastPct);
  // Escalate warning → critical once; otherwise skip within the dedupe window.
  if (level === "critical" && lastLevel !== "critical") return true;
  return false;
}
