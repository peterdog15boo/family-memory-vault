import { and, asc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";

export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 8;

export type StoredPushSubscription = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function upsertPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  const db = getDb();
  const now = new Date();
  const endpoint = input.endpoint.trim();
  const p256dh = input.p256dh.trim();
  const auth = input.auth.trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("invalid_push_subscription");
  }

  await db
    .insert(pushSubscriptions)
    .values({
      id: nanoid(),
      userId: input.userId,
      endpoint,
      p256dh,
      auth,
      userAgent: input.userAgent?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: input.userId,
        p256dh,
        auth,
        userAgent: input.userAgent?.trim() || null,
        updatedAt: now,
      },
    });

  await pruneOldestSubscriptions(input.userId);
}

export async function deletePushSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint.trim()),
      ),
    );
}

export async function deletePushSubscriptionByEndpointOnly(
  endpoint: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint.trim()));
}

export async function listPushSubscriptionsForUser(
  userId: string,
): Promise<StoredPushSubscription[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  return rows;
}

async function pruneOldestSubscriptions(userId: string): Promise<void> {
  const db = getDb();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  const extra = Number(count) - MAX_PUSH_SUBSCRIPTIONS_PER_USER;
  if (extra <= 0) return;

  const oldest = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.updatedAt))
    .limit(extra);

  for (const row of oldest) {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id));
  }
}
