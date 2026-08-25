/**
 * Admin user management — list, detail, suspend, plan override, hard delete.
 */

import { clerkClient } from "@clerk/nextjs/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { logAdminAudit } from "@/lib/admin/audit";
import { assertAdminUser } from "@/lib/auth/admin";
import { formatBytes } from "@/lib/billing/quotas";
import { getDb } from "@/lib/db";
import { collectDeletableMediaKeys } from "@/lib/media/delete";
import { logger } from "@/lib/observability/logger";
import { likeContainsPattern } from "@/lib/security/sanitize";
import {
  betaNdaAcceptances,
  families,
  familyMembers,
  media,
  memories,
  moderationEvents,
  plans,
  subscriptions,
  termsAcceptances,
  users,
  type PlanSlug,
} from "@/lib/db/schema";
import { assignUserPlan } from "@/lib/plans/assign";

export type AdminUserListFilter = {
  q?: string;
  status?: "all" | "active" | "suspended" | "admin";
  plan?: "all" | PlanSlug | string;
  limit?: number;
  offset?: number;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  displayName: string | null;
  imageUrl: string | null;
  isAdmin: boolean;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  planSlug: string;
  planName: string;
  storageBytes: number;
  storageLabel: string;
};

export type AdminUserDetail = AdminUserListItem & {
  counts: {
    media: number;
    memories: number;
    families: number;
    moderationEvents: number;
  };
  moderationByStatus: Array<{ status: string; count: number }>;
  families: Array<{
    id: string;
    name: string;
    role: string;
    status: string;
  }>;
  recentModeration: Array<{
    id: string;
    mediaId: string;
    eventType: string;
    source: string;
    newModerationStatus: string | null;
    notes: string | null;
    createdAt: Date;
    filename: string | null;
  }>;
  subscription: {
    id: string;
    status: string;
    billingInterval: string;
    planSlug: string;
    planName: string;
    stripeSubscriptionId: string | null;
  } | null;
};

function storageSubquery() {
  return sql<number>`coalesce((
    select sum(${media.byteSize})
    from ${media}
    where ${media.userId} = ${users.id}
      and ${media.status} <> 'csam_quarantined'
  ), 0)`.mapWith(Number);
}

function buildListWhere(filter: AdminUserListFilter): SQL | undefined {
  const parts: SQL[] = [];

  const pattern = likeContainsPattern(filter.q);
  if (pattern) {
    parts.push(
      or(
        ilike(users.email, pattern),
        ilike(users.displayName, pattern),
        ilike(users.id, pattern),
      )!,
    );
  }

  if (filter.status === "suspended") {
    parts.push(isNotNull(users.suspendedAt));
  } else if (filter.status === "active") {
    parts.push(isNull(users.suspendedAt));
  } else if (filter.status === "admin") {
    parts.push(eq(users.isAdmin, true));
  }

  if (filter.plan && filter.plan !== "all") {
    parts.push(
      sql`coalesce(${plans.slug}, 'free') = ${filter.plan}`,
    );
  }

  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

export async function listAdminUsers(
  actorUserId: string,
  filter: AdminUserListFilter = {},
): Promise<{ users: AdminUserListItem[]; total: number }> {
  await assertAdminUser(actorUserId);

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const where = buildListWhere(filter);
  const db = getDb();

  const baseFrom = db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      isAdmin: users.isAdmin,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
      lastActiveAt: users.lastActiveAt,
      createdAt: users.createdAt,
      planSlug: sql<string>`coalesce(${plans.slug}, 'free')`.mapWith(String),
      planName: sql<string>`coalesce(${plans.name}, 'Free')`.mapWith(String),
      storageBytes: storageSubquery(),
    })
    .from(users)
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, users.id),
        sql`${subscriptions.status} in ('active', 'trialing', 'past_due')`,
      ),
    )
    .leftJoin(plans, eq(subscriptions.planId, plans.id));

  const rows = await (where ? baseFrom.where(where) : baseFrom)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ value: count() })
    .from(users)
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, users.id),
        sql`${subscriptions.status} in ('active', 'trialing', 'past_due')`,
      ),
    )
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(where ?? sql`true`);

  return {
    users: rows.map((row) => ({
      ...row,
      storageBytes: Number(row.storageBytes ?? 0),
      storageLabel: formatBytes(Number(row.storageBytes ?? 0), 1),
    })),
    total: Number(totalRow?.value ?? 0),
  };
}

export async function getAdminUserDetail(
  actorUserId: string,
  targetUserId: string,
): Promise<AdminUserDetail | null> {
  await assertAdminUser(actorUserId);

  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      isAdmin: users.isAdmin,
      suspendedAt: users.suspendedAt,
      suspendedReason: users.suspendedReason,
      lastActiveAt: users.lastActiveAt,
      createdAt: users.createdAt,
      planSlug: sql<string>`coalesce(${plans.slug}, 'free')`.mapWith(String),
      planName: sql<string>`coalesce(${plans.name}, 'Free')`.mapWith(String),
      storageBytes: storageSubquery(),
      subId: subscriptions.id,
      subStatus: subscriptions.status,
      subInterval: subscriptions.billingInterval,
      subStripe: subscriptions.stripeSubscriptionId,
      subPlanSlug: plans.slug,
      subPlanName: plans.name,
    })
    .from(users)
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, users.id),
        sql`${subscriptions.status} in ('active', 'trialing', 'past_due')`,
      ),
    )
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!row) return null;

  const [
    [mediaCount],
    [memoryCount],
    [familyCount],
    [moderationCount],
    moderationByStatus,
    familyRows,
    recentModeration,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(media)
      .where(eq(media.userId, targetUserId)),
    db
      .select({ value: count() })
      .from(memories)
      .where(eq(memories.userId, targetUserId)),
    db
      .select({ value: count() })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.userId, targetUserId),
          eq(familyMembers.status, "active"),
        ),
      ),
    db
      .select({ value: count() })
      .from(moderationEvents)
      .innerJoin(media, eq(moderationEvents.mediaId, media.id))
      .where(eq(media.userId, targetUserId)),
    db
      .select({
        status: media.moderationStatus,
        value: count(),
      })
      .from(media)
      .where(eq(media.userId, targetUserId))
      .groupBy(media.moderationStatus)
      .orderBy(asc(media.moderationStatus)),
    db
      .select({
        id: families.id,
        name: families.name,
        role: familyMembers.role,
        status: familyMembers.status,
      })
      .from(familyMembers)
      .innerJoin(families, eq(familyMembers.familyId, families.id))
      .where(eq(familyMembers.userId, targetUserId))
      .orderBy(asc(families.name)),
    db
      .select({
        id: moderationEvents.id,
        mediaId: moderationEvents.mediaId,
        eventType: moderationEvents.eventType,
        source: moderationEvents.source,
        newModerationStatus: moderationEvents.newModerationStatus,
        notes: moderationEvents.notes,
        createdAt: moderationEvents.createdAt,
        filename: media.originalFilename,
      })
      .from(moderationEvents)
      .innerJoin(media, eq(moderationEvents.mediaId, media.id))
      .where(eq(media.userId, targetUserId))
      .orderBy(desc(moderationEvents.createdAt))
      .limit(25),
  ]);

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    isAdmin: row.isAdmin,
    suspendedAt: row.suspendedAt,
    suspendedReason: row.suspendedReason,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    planSlug: row.planSlug,
    planName: row.planName,
    storageBytes: Number(row.storageBytes ?? 0),
    storageLabel: formatBytes(Number(row.storageBytes ?? 0), 1),
    counts: {
      media: Number(mediaCount?.value ?? 0),
      memories: Number(memoryCount?.value ?? 0),
      families: Number(familyCount?.value ?? 0),
      moderationEvents: Number(moderationCount?.value ?? 0),
    },
    moderationByStatus: moderationByStatus.map((r) => ({
      status: r.status,
      count: Number(r.value),
    })),
    families: familyRows,
    recentModeration,
    subscription: row.subId
      ? {
          id: row.subId,
          status: row.subStatus!,
          billingInterval: row.subInterval!,
          planSlug: row.subPlanSlug ?? row.planSlug,
          planName: row.subPlanName ?? row.planName,
          stripeSubscriptionId: row.subStripe,
        }
      : null,
  };
}

export async function setUserSuspended(
  actorUserId: string,
  targetUserId: string,
  suspended: boolean,
  reason?: string | null,
): Promise<void> {
  await assertAdminUser(actorUserId);
  if (actorUserId === targetUserId && suspended) {
    throw new Error("You cannot suspend your own account.");
  }

  const db = getDb();
  const now = new Date();
  const [exists] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!exists) throw new Error("User not found.");

  await db
    .update(users)
    .set({
      suspendedAt: suspended ? now : null,
      suspendedReason: suspended
        ? reason?.trim() || "Suspended by admin"
        : null,
      updatedAt: now,
    })
    .where(eq(users.id, targetUserId));

  await logAdminAudit({
    actorId: actorUserId,
    action: suspended ? "user.suspend" : "user.unsuspend",
    targetType: "user",
    targetId: targetUserId,
    metadata: {
      reason: suspended ? reason?.trim() || "Suspended by admin" : null,
    },
  });
}

/**
 * Support override: set the user's plan in DB (does not call Stripe).
 */
export async function adminSetUserPlan(
  actorUserId: string,
  targetUserId: string,
  planSlug: string,
): Promise<{ planSlug: string; planName: string }> {
  await assertAdminUser(actorUserId);

  const [exists] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!exists) throw new Error("User not found.");

  const result = await assignUserPlan(targetUserId, planSlug, {
    source: "admin",
  });

  await logAdminAudit({
    actorId: actorUserId,
    action: "user.plan_change",
    targetType: "user",
    targetId: targetUserId,
    metadata: {
      planSlug: result.planSlug,
      planName: result.planName,
      previousPlanId: result.previousPlanId,
      planSource: "admin",
      supportOverride: true,
    },
  });

  return { planSlug: result.planSlug, planName: result.planName };
}

/**
 * Strong confirmation for hard delete: must type the account email or DELETE.
 */
export function matchesAdminUserDeleteConfirmation(
  email: string,
  confirmation: string,
): boolean {
  const typed = confirmation.trim();
  if (!typed) return false;
  if (typed.toUpperCase() === "DELETE") return true;
  return typed.toLowerCase() === email.trim().toLowerCase();
}

export type AdminDeleteUserResult = {
  deletedUserId: string;
  email: string;
  clerkDeleted: boolean;
  mediaRows: number;
  r2ObjectsAttempted: number;
};

/**
 * Permanently delete a user for test-account recycling.
 * Cascades app data via FKs, best-effort R2 cleanup, then removes the Clerk user
 * so the same email can sign up again as a fresh ritual candidate.
 */
export async function adminDeleteUser(
  actorUserId: string,
  targetUserId: string,
  confirmation: string,
): Promise<AdminDeleteUserResult> {
  await assertAdminUser(actorUserId);

  if (actorUserId === targetUserId) {
    throw new Error("You cannot delete your own account from this UI.");
  }

  const db = getDb();
  const [target] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    throw new Error("User not found.");
  }

  if (!matchesAdminUserDeleteConfirmation(target.email, confirmation)) {
    throw new Error(
      'Confirmation did not match. Type the user’s email or DELETE to proceed.',
    );
  }

  const mediaRows = await db
    .select({
      id: media.id,
      originalKey: media.originalKey,
      processedKey: media.processedKey,
      thumbnailKey: media.thumbnailKey,
      status: media.status,
      moderationStatus: media.moderationStatus,
    })
    .from(media)
    .where(eq(media.userId, targetUserId));

  let r2ObjectsAttempted = 0;
  try {
    const { deleteObject } = await import("@/lib/r2");
    for (const row of mediaRows) {
      if (
        row.status === "csam_quarantined" ||
        row.moderationStatus === "csam_quarantined"
      ) {
        continue;
      }
      for (const key of collectDeletableMediaKeys(row)) {
        r2ObjectsAttempted += 1;
        try {
          await deleteObject(key);
        } catch (error) {
          logger.warn("admin.user_delete.r2_failed", {
            targetUserId,
            mediaId: row.id,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } catch (error) {
    logger.warn("admin.user_delete.r2_init_failed", {
      targetUserId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  // Drop clickwrap rows so re-signup is a clean legal + ritual path.
  await db
    .delete(betaNdaAcceptances)
    .where(eq(betaNdaAcceptances.userId, targetUserId));
  await db
    .delete(termsAcceptances)
    .where(eq(termsAcceptances.userId, targetUserId));
  await db
    .delete(betaNdaAcceptances)
    .where(eq(betaNdaAcceptances.email, target.email.toLowerCase()));
  await db
    .delete(termsAcceptances)
    .where(eq(termsAcceptances.email, target.email.toLowerCase()));

  await logAdminAudit({
    actorId: actorUserId,
    action: "user.delete",
    targetType: "user",
    targetId: targetUserId,
    metadata: {
      email: target.email,
      displayName: target.displayName,
      wasAdmin: target.isAdmin,
      mediaCount: mediaRows.length,
      r2ObjectsAttempted,
      hardDelete: true,
    },
  });

  await db.delete(users).where(eq(users.id, targetUserId));

  let clerkDeleted = false;
  try {
    const client = await clerkClient();
    await client.users.deleteUser(targetUserId);
    clerkDeleted = true;
  } catch (error) {
    logger.error("admin.user_delete.clerk_failed", {
      targetUserId,
      email: target.email,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      "App data was deleted, but Clerk user removal failed. Delete the user in the Clerk dashboard so the email can be reused.",
    );
  }

  logger.info("admin.user_deleted", {
    actorUserId,
    targetUserId,
    email: target.email,
    mediaCount: mediaRows.length,
    clerkDeleted,
  });

  return {
    deletedUserId: targetUserId,
    email: target.email,
    clerkDeleted,
    mediaRows: mediaRows.length,
    r2ObjectsAttempted,
  };
}

export async function isUserSuspended(userId: string): Promise<boolean> {
  if (!userId?.trim()) return false;
  try {
    const db = getDb();
    const [row] = await db
      .select({ suspendedAt: users.suspendedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return Boolean(row?.suspendedAt);
  } catch {
    return false;
  }
}
