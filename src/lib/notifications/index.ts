/**
 * Notification helpers — create, fetch, and mark in-app notifications.
 *
 * All writes are user-scoped. Admin tools can pass any userId; every
 * query uses userId as the first filter to prevent cross-user access.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  notifications,
  NOTIFICATION_TYPES,
  type Notification,
  type NotificationType,
} from "@/lib/db/schema";

export { NOTIFICATION_TYPES };
export type { Notification, NotificationType };

/* -------------------------------------------------------------------------- */
/* Typed notification payloads                                                 */
/* -------------------------------------------------------------------------- */

export type NotificationData = {
  media_ready: {
    mediaId: string;
    filename?: string;
    /** Deep link inside the app */
    link?: string;
  };
  movie_ready: {
    movieId: string;
    memoryId?: string;
    title?: string;
    link?: string;
  };
  family_invite: {
    familyId: string;
    familyName?: string;
    inviterName?: string;
    role?: string;
    link?: string;
  };
  storage_warning: {
    usedBytes: number;
    limitBytes: number | null;
    percentUsed: number;
    link?: string;
  };
  moderation_attention: {
    mediaId?: string;
    reason?: string;
    link?: string;
  };
  emergency_access: {
    designationId: string;
    action: "designated" | "requested" | "granted" | "denied";
    ownerUserId?: string;
    designateeName?: string;
    link?: string;
  };
};

type CreateNotificationInput<T extends NotificationType> = {
  userId: string;
  type: T;
  title: string;
  message: string;
  data?: NotificationData[T];
};

/* -------------------------------------------------------------------------- */
/* createNotification                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Insert a new notification for a user.
 * `link` and `metadata` are extracted from `data` when provided.
 */
export async function createNotification<T extends NotificationType>(
  input: CreateNotificationInput<T>,
): Promise<Notification | null> {
  const { userAllowsInApp } = await import("@/lib/account-preferences");
  if (!(await userAllowsInApp(input.userId, input.type))) {
    return null;
  }

  const db = getDb();
  const now = new Date();

  // Pull link out of data if present; everything else is stored as metadata.
  const { link, ...rest } = (input.data ?? {}) as {
    link?: string;
    [key: string]: unknown;
  };
  const metadata: Record<string, unknown> = rest;

  const [row] = await db
    .insert(notifications)
    .values({
      id: nanoid(),
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: link ?? null,
      metadata,
      createdAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create notification.");
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/* Pre-built factory helpers                                                   */
/* -------------------------------------------------------------------------- */

export async function notifyMediaReady(
  userId: string,
  data: NotificationData["media_ready"],
): Promise<Notification | null> {
  return createNotification({
    userId,
    type: "media_ready",
    title: "Photo ready",
    message: data.filename
      ? `"${data.filename}" has passed moderation and is ready in Photos.`
      : "Your upload has passed moderation and is ready in Photos.",
    data: { ...data, link: data.link ?? "/media" },
  });
}

export async function notifyMovieReady(
  userId: string,
  data: NotificationData["movie_ready"],
): Promise<Notification | null> {
  const movieLink = data.link ?? (data.movieId ? `/movies` : "/movies");
  return createNotification({
    userId,
    type: "movie_ready",
    title: `Your movie is ready`,
    message: data.title
      ? `"${data.title}" has finished rendering and is ready to watch.`
      : "Your memory movie has finished rendering and is ready to watch.",
    data: { ...data, link: movieLink },
  });
}

export async function notifyFamilyInvite(
  userId: string,
  data: NotificationData["family_invite"],
): Promise<Notification | null> {
  const inviterPart = data.inviterName ? ` from ${data.inviterName}` : "";
  const familyPart = data.familyName ? ` to "${data.familyName}"` : "";
  return createNotification({
    userId,
    type: "family_invite",
    title: "Family invitation",
    message: `You've received an invitation${inviterPart}${familyPart}. Accept to start sharing memories together.`,
    data: { ...data, link: data.link ?? "/family" },
  });
}

export async function notifyStorageWarning(
  userId: string,
  data: NotificationData["storage_warning"],
): Promise<Notification | null> {
  const pct = Math.round(data.percentUsed);
  return createNotification({
    userId,
    type: "storage_warning",
    title: pct >= 100 ? "Storage full" : "Storage is getting full",
    message:
      pct >= 100
        ? "Your vault storage is full — new uploads are paused. Free up space or upgrade your plan."
        : `You've used ${pct}% of your storage. Consider upgrading before you run out of room.`,
    data: { ...data, link: data.link ?? "/billing" },
  });
}

export async function notifyModerationAttention(
  userId: string,
  data: NotificationData["moderation_attention"],
): Promise<Notification | null> {
  return createNotification({
    userId,
    type: "moderation_attention",
    title: "Upload needs attention",
    message: data.reason
      ? `An upload requires manual review: ${data.reason}.`
      : "An upload has been flagged and requires review before it can appear in Photos.",
    data: { ...data, link: data.link ?? "/media" },
  });
}

/* -------------------------------------------------------------------------- */
/* Read / list                                                                 */
/* -------------------------------------------------------------------------- */

export type GetNotificationsOptions = {
  /** Max rows to return (default 50). */
  limit?: number;
  /** Return only unread. */
  unreadOnly?: boolean;
  /** Filter by type. */
  type?: NotificationType;
};

/**
 * Fetch notifications for a user, newest first.
 */
export async function getUserNotifications(
  userId: string,
  options: GetNotificationsOptions = {},
): Promise<Notification[]> {
  const db = getDb();
  const { limit = 50, unreadOnly = false, type } = options;

  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        unreadOnly ? isNull(notifications.readAt) : undefined,
        type ? eq(notifications.type, type) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(Math.min(limit, 200));
}

/**
 * Unread notifications only — lightweight for badge counts.
 */
export async function getUnreadNotifications(
  userId: string,
  limit = 50,
): Promise<Notification[]> {
  return getUserNotifications(userId, { limit, unreadOnly: true });
}

/**
 * Count of unread notifications for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return Number(row?.value ?? 0);
}

/* -------------------------------------------------------------------------- */
/* markAsRead / markAllAsRead                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mark a single notification as read. Verifies ownership.
 * Returns the updated notification, or null if not found / not owned.
 */
export async function markAsRead(
  notificationId: string,
  userId: string,
): Promise<Notification | null> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Mark all of a user's unread notifications as read.
 * Returns the count updated.
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hard-delete a notification. Verifies ownership.
 */
export async function deleteNotification(
  notificationId: string,
  userId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length > 0;
}
