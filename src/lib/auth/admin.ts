/**
 * Admin authorization helpers.
 *
 * Primary source of truth: `users.is_admin` in the database.
 * Bootstrap / emergency override: `ADMIN_USER_IDS` (comma-separated Clerk ids).
 *
 * Promote in development:
 *   npm run admin:promote -- --email=you@example.com
 *   npm run admin:promote -- --userId=user_xxx
 */

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

function parseAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

/** Sync env allowlist check (bootstrap only — prefer `isAdmin`). */
export function isEnvAdmin(userId: string | null | undefined): boolean {
  if (!userId?.trim()) return false;
  return parseAdminUserIds().has(userId);
}

export function getEnvAdminUserIds(): string[] {
  return [...parseAdminUserIds()];
}

/**
 * Whether the user may access admin tools.
 * True if `users.is_admin` or listed in `ADMIN_USER_IDS`.
 */
export async function isAdmin(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId?.trim()) return false;
  if (isEnvAdmin(userId)) return true;

  try {
    const db = getDb();
    const [row] = await db
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return Boolean(row?.isAdmin);
  } catch (error) {
    console.error("[auth.admin] isAdmin lookup failed", error);
    return false;
  }
}

/** @deprecated Use `isAdmin` (async). Kept as sync env-only for rare edge cases. */
export function isAdminUser(userId: string | null | undefined): boolean {
  return isEnvAdmin(userId);
}

export function isAdminAccessConfigured(): boolean {
  // Always "configured" once the DB column exists; env is optional bootstrap.
  return true;
}

/**
 * Throws if the caller is not an admin (DB flag or env allowlist).
 */
export async function assertAdminUser(actorUserId: string): Promise<void> {
  if (!actorUserId?.trim()) {
    throw new Error("Admin action requires an authenticated user id.");
  }
  if (!(await isAdmin(actorUserId))) {
    throw new Error("Forbidden: admin access only.");
  }
}

/**
 * Alias for assertAdminUser — use in API/services that should throw.
 */
export async function requireAdminUser(actorUserId: string): Promise<void> {
  return assertAdminUser(actorUserId);
}

/**
 * For App Router pages/layouts: require a signed-in admin, else redirect.
 * Returns the Clerk user id.
 */
export async function requireAdmin(): Promise<string> {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }
  if (!(await isAdmin(userId))) {
    redirect("/dashboard");
  }
  return userId;
}

export type AdminApiAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * For `/api/admin/*` route handlers — returns a result instead of redirecting.
 * Also blocks suspended accounts from performing admin API actions.
 */
export async function requireAdminApi(): Promise<AdminApiAuthResult> {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!(await isAdmin(userId))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  try {
    const { isUserSuspended } = await import("@/lib/admin/users");
    if (await isUserSuspended(userId)) {
      return { ok: false, status: 403, error: "Account suspended" };
    }
  } catch (error) {
    console.error("[auth.admin] suspend check failed", error);
    return {
      ok: false,
      status: 403,
      error: "Unable to verify account status",
    };
  }

  try {
    const { hasAcceptedBetaNda, isBetaNdaRequired } = await import(
      "@/lib/beta-nda"
    );
    if (isBetaNdaRequired() && !(await hasAcceptedBetaNda(userId))) {
      return { ok: false, status: 403, error: "Beta NDA acceptance required" };
    }
  } catch (error) {
    console.error("[auth.admin] beta NDA check failed", error);
    return {
      ok: false,
      status: 403,
      error: "Unable to verify beta agreement status",
    };
  }

  return { ok: true, userId };
}

/**
 * Set or clear the database admin flag for a user.
 * Does not modify ADMIN_USER_IDS.
 */
export async function setUserAdminFlag(
  actorUserId: string,
  targetUserId: string,
  isAdminFlag: boolean,
): Promise<{ id: string; email: string; isAdmin: boolean } | null> {
  await assertAdminUser(actorUserId);

  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(users)
    .set({ isAdmin: isAdminFlag, updatedAt: now })
    .where(eq(users.id, targetUserId))
    .returning({
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
    });

  if (row) {
    const { logAdminAudit } = await import("@/lib/admin/audit");
    await logAdminAudit({
      actorId: actorUserId,
      action: isAdminFlag ? "user.admin_grant" : "user.admin_revoke",
      targetType: "user",
      targetId: targetUserId,
      metadata: { email: row.email },
    });
  }

  return row ?? null;
}
