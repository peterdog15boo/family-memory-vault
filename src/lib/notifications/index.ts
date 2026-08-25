/**
 * Notification helpers — create, fetch, and mark in-app notifications.
 *
 * All writes are user-scoped. Admin tools can pass any userId; every
 * query uses userId as the first filter to prevent cross-user access.
 * Titles/messages are written in the recipient’s preferred locale.
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
import { translatorForUserId } from "@/lib/i18n/user-locale";

export { NOTIFICATION_TYPES };
export type { Notification, NotificationType };
export {
  resolveNotificationHref,
  sanitizeInternalPath,
  parseMovieIdFromHref,
} from "@/lib/notifications/links";

/* -------------------------------------------------------------------------- */
/* Typed notification payloads                                                 */
/* -------------------------------------------------------------------------- */

export type NotificationData = {
  media_ready: {
    mediaId: string;
    filename?: string;
    /** Deep link inside the app */
    link?: string;
    celebration?: import("@/lib/gamification/types").JourneyCelebrationPayload | null;
    celebrationShown?: boolean;
  };
  movie_ready: {
    movieId: string;
    memoryId?: string;
    title?: string;
    link?: string;
    /** Deep-link back into the first-session Big Reveal. */
    firstFamilyMovie?: boolean;
    celebration?: import("@/lib/gamification/types").JourneyCelebrationPayload | null;
    celebrationShown?: boolean;
  };
  memory_created: {
    memoryId?: string;
    movieId?: string;
    memoryKind?: import("@/lib/gamification/types").MemoryKind;
    title?: string;
    link?: string;
    celebration?: import("@/lib/gamification/types").JourneyCelebrationPayload | null;
    celebrationShown?: boolean;
  };
  family_invite: {
    familyId: string;
    familyName?: string;
    inviterName?: string;
    role?: string;
    link?: string;
  };
  family_milestone: {
    familyId: string;
    memberId?: string;
    kind: "invite_accepted" | "first_contribution";
    link?: string;
    celebration?: import("@/lib/gamification/types").JourneyCelebrationPayload | null;
    celebrationShown?: boolean;
  };
  legacy_milestone: {
    strengthPercent: number;
    categoryId?: string;
    link?: string;
    celebration?: import("@/lib/gamification/types").JourneyCelebrationPayload | null;
    celebrationShown?: boolean;
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
  family_chat: {
    familyId: string;
    threadId: string;
    kind: "thread_created" | "message";
    senderName?: string;
    preview?: string;
    link?: string;
  };
  photo_request: {
    requestId: string;
    familyId: string;
    familyName?: string;
    requesterName?: string;
    message?: string;
    link?: string;
  };
  weekly_digest: {
    photoCount?: number;
    memoryCount?: number;
    movieCount?: number;
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
  const { t } = await translatorForUserId(userId);
  return createNotification({
    userId,
    type: "media_ready",
    title: t("notifications.mediaReady.title"),
    message: data.filename
      ? t("notifications.mediaReady.messageWithFilename", {
          filename: data.filename,
        })
      : t("notifications.mediaReady.message"),
    data: { ...data, link: data.link ?? "/media" },
  });
}

export async function notifyMovieReady(
  userId: string,
  data: NotificationData["movie_ready"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  const { resolveNotificationHref } = await import("@/lib/notifications/links");
  const movieLink = resolveNotificationHref({
    type: "movie_ready",
    link: data.link,
    metadata: {
      movieId: data.movieId,
      memoryId: data.memoryId,
      firstFamilyMovie: data.firstFamilyMovie === true,
    },
  });
  return createNotification({
    userId,
    type: "movie_ready",
    title: t("notifications.movieReady.title"),
    message: data.title
      ? t("notifications.movieReady.messageWithTitle", { title: data.title })
      : t("notifications.movieReady.message"),
    data: { ...data, link: movieLink },
  });
}

export async function notifyMemoryCreated(
  userId: string,
  data: NotificationData["memory_created"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  const link =
    data.link ??
    (data.memoryId ? `/memories/${data.memoryId}` : "/memories");
  return createNotification({
    userId,
    type: "memory_created",
    title: t("notifications.memoryCreated.title"),
    message: data.title
      ? t("notifications.memoryCreated.messageWithTitle", { title: data.title })
      : t("notifications.memoryCreated.message"),
    data: { ...data, link },
  });
}

export async function notifyLegacyMilestone(
  userId: string,
  data: NotificationData["legacy_milestone"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  return createNotification({
    userId,
    type: "legacy_milestone",
    title: t("notifications.legacyMilestone.title"),
    message: t("notifications.legacyMilestone.message", {
      percent: data.strengthPercent,
    }),
    data: { ...data, link: data.link ?? "/legacy" },
  });
}

export async function notifyFamilyMilestone(
  userId: string,
  data: NotificationData["family_milestone"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  const accepted = data.kind === "invite_accepted";
  return createNotification({
    userId,
    type: "family_milestone",
    title: accepted
      ? t("notifications.familyMilestone.acceptedTitle")
      : t("notifications.familyMilestone.contributionTitle"),
    message: accepted
      ? t("notifications.familyMilestone.acceptedMessage")
      : t("notifications.familyMilestone.contributionMessage"),
    data: { ...data, link: data.link ?? "/family" },
  });
}

export async function notifyFamilyInvite(
  userId: string,
  data: NotificationData["family_invite"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  const hasInviter = Boolean(data.inviterName);
  const hasFamily = Boolean(data.familyName);
  let message: string;
  if (hasInviter && hasFamily) {
    message = t("notifications.familyInvite.messageFull", {
      inviter: data.inviterName,
      family: data.familyName,
    });
  } else if (hasInviter) {
    message = t("notifications.familyInvite.messageWithInviter", {
      inviter: data.inviterName,
    });
  } else if (hasFamily) {
    message = t("notifications.familyInvite.messageWithFamily", {
      family: data.familyName,
    });
  } else {
    message = t("notifications.familyInvite.message");
  }
  return createNotification({
    userId,
    type: "family_invite",
    title: t("notifications.familyInvite.title"),
    message,
    data: { ...data, link: data.link ?? "/family" },
  });
}

export async function notifyFamilyChat(
  userId: string,
  data: NotificationData["family_chat"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  const sender = data.senderName?.trim() || t("notifications.familyChat.someone");
  const link =
    data.link ??
    `/#family-chat=${encodeURIComponent(data.threadId)}&family=${encodeURIComponent(data.familyId)}`;

  if (data.kind === "thread_created") {
    return createNotification({
      userId,
      type: "family_chat",
      title: t("notifications.familyChat.newChatTitle"),
      message: t("notifications.familyChat.newChatMessage", { name: sender }),
      data: { ...data, link },
    });
  }

  return createNotification({
    userId,
    type: "family_chat",
    title: t("notifications.familyChat.messageTitle", { name: sender }),
    message: data.preview
      ? t("notifications.familyChat.messagePreview", {
          name: sender,
          preview: data.preview,
        })
      : t("notifications.familyChat.messageFallback", { name: sender }),
    data: { ...data, link },
  });
}

export async function notifyPhotoRequest(
  userId: string,
  data: NotificationData["photo_request"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  const requester = data.requesterName?.trim();
  return createNotification({
    userId,
    type: "photo_request",
    title: t("notifications.photoRequest.title"),
    message: requester
      ? t("notifications.photoRequest.messageWithName", {
          name: requester,
          message: data.message ?? "",
        })
      : t("notifications.photoRequest.message", {
          message: data.message ?? "",
        }),
    data: {
      ...data,
      link: data.link ?? "/upload",
    },
  });
}

export async function notifyWeeklyDigest(
  userId: string,
  data: NotificationData["weekly_digest"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  return createNotification({
    userId,
    type: "weekly_digest",
    title: t("notifications.weeklyDigest.title"),
    message: t("notifications.weeklyDigest.message", {
      photos: data.photoCount ?? 0,
      memories: data.memoryCount ?? 0,
      movies: data.movieCount ?? 0,
    }),
    data: { ...data, link: data.link ?? "/on-this-day" },
  });
}

export async function notifyStorageWarning(
  userId: string,
  data: NotificationData["storage_warning"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  const pct = Math.round(data.percentUsed);
  const full = pct >= 100;
  return createNotification({
    userId,
    type: "storage_warning",
    title: full
      ? t("notifications.storageWarning.titleFull")
      : t("notifications.storageWarning.titleNear"),
    message: full
      ? t("notifications.storageWarning.messageFull")
      : t("notifications.storageWarning.messageNear", { percent: pct }),
    data: { ...data, link: data.link ?? "/billing" },
  });
}

export async function notifyModerationAttention(
  userId: string,
  data: NotificationData["moderation_attention"],
): Promise<Notification | null> {
  const { t } = await translatorForUserId(userId);
  return createNotification({
    userId,
    type: "moderation_attention",
    title: t("notifications.moderationAttention.title"),
    message: data.reason
      ? t("notifications.moderationAttention.messageWithReason", {
          reason: data.reason,
        })
      : t("notifications.moderationAttention.message"),
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
