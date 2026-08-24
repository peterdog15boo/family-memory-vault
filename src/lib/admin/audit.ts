/**
 * Admin audit logging — easy to call from any admin mutation.
 *
 *   await logAdminAudit({
 *     actorId,
 *     action: "user.suspend",
 *     targetType: "user",
 *     targetId,
 *     metadata: { reason },
 *   });
 *
 * Failures are logged to the console and never throw (support actions stay reliable).
 */

import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { assertAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { adminAuditLogs, users, type AdminAuditLog } from "@/lib/db/schema";
import { likeContainsPattern } from "@/lib/security/sanitize";

/** Common action names — use these for consistency; any string is allowed. */
export const ADMIN_AUDIT_ACTIONS = [
  "user.suspend",
  "user.unsuspend",
  "user.plan_change",
  "user.admin_grant",
  "user.admin_revoke",
  "moderation.review",
  "moderation.quarantine",
  "job.retry",
  "admin.inspect",
  "email.announcement_send",
] as const;

export type AdminAuditAction =
  | (typeof ADMIN_AUDIT_ACTIONS)[number]
  | (string & {});

export type AdminAuditTargetType =
  | "user"
  | "media"
  | "processing_job"
  | "subscription"
  | (string & {});

export type LogAdminAuditInput = {
  actorId: string;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  metadata?: Record<string, unknown> | null;
};

export type AdminAuditListItem = AdminAuditLog & {
  actorEmail: string | null;
  actorDisplayName: string | null;
};

/**
 * Persist one admin audit row. Never throws to callers.
 * Returns the created id, or null if logging failed.
 */
export async function logAdminAudit(
  input: LogAdminAuditInput,
): Promise<string | null> {
  try {
    if (!input.actorId?.trim() || !input.action?.trim() || !input.targetId?.trim()) {
      console.warn("[admin.audit] Skipping incomplete audit entry", input);
      return null;
    }

    const db = getDb();
    const id = nanoid();
    await db.insert(adminAuditLogs).values({
      id,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    });
    return id;
  } catch (error) {
    console.error("[admin.audit] Failed to write audit log", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      error,
    });
    return null;
  }
}

/**
 * Fire-and-forget wrapper when you do not want to await.
 */
export function queueAdminAudit(input: LogAdminAuditInput): void {
  void logAdminAudit(input);
}

export type ListAdminAuditFilter = {
  q?: string;
  action?: string;
  targetType?: string;
  actorId?: string;
  limit?: number;
  offset?: number;
};

export async function listAdminAuditLogs(
  actorUserId: string,
  filter: ListAdminAuditFilter = {},
): Promise<{ logs: AdminAuditListItem[]; total: number }> {
  await assertAdminUser(actorUserId);

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const db = getDb();

  const parts: SQL[] = [];
  if (filter.action?.trim()) {
    parts.push(eq(adminAuditLogs.action, filter.action.trim()));
  }
  if (filter.targetType?.trim()) {
    parts.push(eq(adminAuditLogs.targetType, filter.targetType.trim()));
  }
  if (filter.actorId?.trim()) {
    parts.push(eq(adminAuditLogs.actorId, filter.actorId.trim()));
  }
  const pattern = likeContainsPattern(filter.q);
  if (pattern) {
    parts.push(
      or(
        ilike(adminAuditLogs.action, pattern),
        ilike(adminAuditLogs.targetId, pattern),
        ilike(adminAuditLogs.targetType, pattern),
        ilike(users.email, pattern),
      )!,
    );
  }

  const where =
    parts.length === 0
      ? undefined
      : parts.length === 1
        ? parts[0]
        : and(...parts);

  const base = db
    .select({
      id: adminAuditLogs.id,
      actorId: adminAuditLogs.actorId,
      action: adminAuditLogs.action,
      targetType: adminAuditLogs.targetType,
      targetId: adminAuditLogs.targetId,
      metadata: adminAuditLogs.metadata,
      createdAt: adminAuditLogs.createdAt,
      actorEmail: users.email,
      actorDisplayName: users.displayName,
    })
    .from(adminAuditLogs)
    .leftJoin(users, eq(adminAuditLogs.actorId, users.id));

  const logs = await (where ? base.where(where) : base)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(adminAuditLogs)
    .leftJoin(users, eq(adminAuditLogs.actorId, users.id))
    .where(where ?? sql`true`);

  return {
    logs,
    total: Number(totalRow?.value ?? 0),
  };
}
