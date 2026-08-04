/**
 * Subscription plans + usage helpers.
 *
 * Resolves the user's effective plan (active subscription → Free fallback),
 * exposes limits, and maintains monthly usage_records snapshots.
 */

import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cache } from "react";
import { getDb } from "@/lib/db";
import {
  media,
  movies,
  plans,
  subscriptions,
  usageRecords,
  type Plan,
  type PlanFeatures,
  type PlanSlug,
  type Subscription,
  type UsageRecord,
  PLAN_SLUGS,
} from "@/lib/db/schema";
import { FREE_PLAN, PLAN_CATALOG, getCatalogPlan } from "@/lib/plans/catalog";

export type { Plan, PlanFeatures, PlanSlug, Subscription, UsageRecord };
export { PLAN_CATALOG, FREE_PLAN, getCatalogPlan } from "@/lib/plans/catalog";
export { PLAN_SLUGS } from "@/lib/db/schema";

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

export type PlanLimits = {
  slug: PlanSlug | string;
  name: string;
  storageLimitBytes: number | null;
  maxFamilyMembers: number;
  maxMoviesPerMonth: number;
  maxActiveMovieJobs: number;
  features: PlanFeatures;
};

export type UserPlanContext = {
  plan: Plan;
  subscription: Subscription | null;
  limits: PlanLimits;
  /** True when falling back to Free (no active paid/legacy sub). */
  isFreeFallback: boolean;
};

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due"] as const;

function toLimits(plan: Plan): PlanLimits {
  return {
    slug: plan.slug,
    name: plan.name,
    storageLimitBytes: plan.storageLimitBytes,
    maxFamilyMembers: plan.maxFamilyMembers,
    maxMoviesPerMonth: plan.maxMoviesPerMonth,
    maxActiveMovieJobs: plan.maxActiveMovieJobs,
    features: (plan.features ?? {}) as PlanFeatures,
  };
}

function freePlanRow(): Plan {
  const now = new Date();
  return {
    id: FREE_PLAN.id,
    name: FREE_PLAN.name,
    slug: FREE_PLAN.slug,
    description: FREE_PLAN.description,
    priceMonthlyCents: FREE_PLAN.priceMonthlyCents,
    priceYearlyCents: FREE_PLAN.priceYearlyCents,
    storageLimitBytes: FREE_PLAN.storageLimitBytes,
    maxFamilyMembers: FREE_PLAN.maxFamilyMembers,
    maxMoviesPerMonth: FREE_PLAN.maxMoviesPerMonth,
    maxActiveMovieJobs: FREE_PLAN.maxActiveMovieJobs,
    features: FREE_PLAN.features,
    sortOrder: FREE_PLAN.sortOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** UTC `YYYY-MM` period key. */
export function currentUsagePeriodKey(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Upsert the canonical plan catalog (idempotent).
 */
export async function seedPlans(): Promise<Plan[]> {
  const db = getDb();
  const now = new Date();
  const rows: Plan[] = [];

  for (const seed of PLAN_CATALOG) {
    const [row] = await db
      .insert(plans)
      .values({
        id: seed.id,
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        priceMonthlyCents: seed.priceMonthlyCents,
        priceYearlyCents: seed.priceYearlyCents,
        storageLimitBytes: seed.storageLimitBytes,
        maxFamilyMembers: seed.maxFamilyMembers,
        maxMoviesPerMonth: seed.maxMoviesPerMonth,
        maxActiveMovieJobs: seed.maxActiveMovieJobs,
        features: seed.features,
        sortOrder: seed.sortOrder,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: seed.name,
          slug: seed.slug,
          description: seed.description,
          priceMonthlyCents: seed.priceMonthlyCents,
          priceYearlyCents: seed.priceYearlyCents,
          storageLimitBytes: seed.storageLimitBytes,
          maxFamilyMembers: seed.maxFamilyMembers,
          maxMoviesPerMonth: seed.maxMoviesPerMonth,
          maxActiveMovieJobs: seed.maxActiveMovieJobs,
          features: seed.features,
          sortOrder: seed.sortOrder,
          updatedAt: now,
        },
      })
      .returning();
    if (row) rows.push(row);
  }

  return rows;
}

export async function listActivePlans(): Promise<Plan[]> {
  const db = getDb();
  return db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));
}

export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getPlanById(planId: string): Promise<Plan | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);
  return row ?? null;
}

/**
 * Active/trialing subscription for a user (user-scoped billing).
 */
export async function getUserSubscription(
  userId: string,
): Promise<(Subscription & { plan: Plan }) | null> {
  const db = getDb();
  const [row] = await db
    .select({
      subscription: subscriptions,
      plan: plans,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        inArray(subscriptions.status, [...ACTIVE_SUB_STATUSES]),
      ),
    )
    .limit(1);

  if (!row) return null;
  return { ...row.subscription, plan: row.plan };
}

/**
 * Resolve the user's current plan + limits.
 * Falls back to Free (DB row or in-memory catalog) when no active sub.
 * Deduped per request via React `cache()` (layout + page + gates share one lookup).
 */
export const getUserPlan = cache(
  async (userId: string): Promise<UserPlanContext> => {
    if (!userId?.trim()) {
      throw new PlanError("userId is required.");
    }

    const sub = await getUserSubscription(userId);
    if (sub) {
      return {
        plan: sub.plan,
        subscription: sub,
        limits: toLimits(sub.plan),
        isFreeFallback: sub.plan.slug === "free",
      };
    }

    const free = (await getPlanBySlug("free")) ?? freePlanRow();
    return {
      plan: free,
      subscription: null,
      limits: toLimits(free),
      isFreeFallback: true,
    };
  },
);

export async function getUserPlanLimits(userId: string): Promise<PlanLimits> {
  const ctx = await getUserPlan(userId);
  return ctx.limits;
}

/**
 * Ensure the user has an active Free subscription row (idempotent).
 * Useful on signup / first vault visit.
 */
export async function ensureFreeSubscription(
  userId: string,
): Promise<Subscription> {
  const existing = await getUserSubscription(userId);
  if (existing) return existing;

  await seedPlans();
  const free = (await getPlanBySlug("free")) ?? freePlanRow();

  const db = getDb();
  const now = new Date();

  // One row per user (unique on user_id) — revive canceled/incomplete if present.
  const [prior] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (prior) {
    const [updated] = await db
      .update(subscriptions)
      .set({
        planId: free.id,
        status: "active",
        billingInterval: "none",
        currentPeriodStart: startOfUtcMonth(now),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, prior.id))
      .returning();
    if (updated) return updated;
  }

  const [created] = await db
    .insert(subscriptions)
    .values({
      id: nanoid(),
      userId,
      familyId: null,
      planId: free.id,
      status: "active",
      billingInterval: "none",
      currentPeriodStart: startOfUtcMonth(now),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const again = await getUserSubscription(userId);
  if (again) return again;
  throw new PlanError("Failed to ensure free subscription.");
}

/* -------------------------------------------------------------------------- */
/* Usage                                                                      */
/* -------------------------------------------------------------------------- */

export async function getUsageRecord(
  userId: string,
  periodKey = currentUsagePeriodKey(),
): Promise<UsageRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        eq(usageRecords.periodKey, periodKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Recompute storage + movie counts for the current month and upsert usage_records.
 */
export async function refreshUserUsage(
  userId: string,
  periodKey = currentUsagePeriodKey(),
): Promise<UsageRecord> {
  const db = getDb();
  const periodStart = startOfUtcMonth();

  const [storageRow] = await db
    .select({
      bytes: sql<number>`coalesce(sum(${media.byteSize}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(media)
    .where(eq(media.userId, userId));

  const [movieRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(movies)
    .where(
      and(eq(movies.userId, userId), gte(movies.createdAt, periodStart)),
    );

  const storageBytes = Number(storageRow?.bytes ?? 0);
  const mediaCount = Number(storageRow?.count ?? 0);
  const moviesCreated = Number(movieRow?.value ?? 0);
  const now = new Date();

  const [upserted] = await db
    .insert(usageRecords)
    .values({
      id: nanoid(),
      userId,
      periodKey,
      storageBytes,
      moviesCreated,
      mediaCount,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [usageRecords.userId, usageRecords.periodKey],
      set: {
        storageBytes,
        moviesCreated,
        mediaCount,
        updatedAt: now,
      },
    })
    .returning();

  if (!upserted) {
    throw new PlanError("Failed to refresh usage record.");
  }
  return upserted;
}

/**
 * Increment movies_created for the current period (call after createMovieJob).
 */
export async function incrementMoviesUsage(userId: string): Promise<void> {
  const periodKey = currentUsagePeriodKey();
  const db = getDb();
  const now = new Date();

  await db
    .insert(usageRecords)
    .values({
      id: nanoid(),
      userId,
      periodKey,
      storageBytes: 0,
      moviesCreated: 1,
      mediaCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [usageRecords.userId, usageRecords.periodKey],
      set: {
        moviesCreated: sql`${usageRecords.moviesCreated} + 1`,
        updatedAt: now,
      },
    });
}

export async function countMoviesCreatedThisMonth(
  userId: string,
): Promise<number> {
  const db = getDb();
  const since = startOfUtcMonth();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(movies)
    .where(and(eq(movies.userId, userId), gte(movies.createdAt, since)));
  return Number(row?.value ?? 0);
}

/**
 * Total bytes of media owned by the user (excludes CSAM quarantine).
 * Prefer `@/lib/billing` for full quota snapshots.
 */
export async function getUserStorageBytes(userId: string): Promise<number> {
  const { getUserStorageUsedBytes } = await import("@/lib/billing/quotas");
  return getUserStorageUsedBytes(userId);
}

/**
 * Whether adding `additionalBytes` would exceed the plan storage limit.
 * Null limit = unlimited.
 */
export async function assertWithinStorageLimit(
  userId: string,
  additionalBytes = 0,
): Promise<{ used: number; limit: number | null }> {
  const { assertUploadWithinStorageQuota, StorageQuotaError } = await import(
    "@/lib/billing/quotas"
  );
  try {
    const snapshot = await assertUploadWithinStorageQuota(
      userId,
      additionalBytes,
    );
    return { used: snapshot.usedBytes, limit: snapshot.limitBytes };
  } catch (err) {
    if (err instanceof StorageQuotaError) {
      throw new PlanError(err.message);
    }
    throw err;
  }
}

export function isPlanSlug(value: string): value is PlanSlug {
  return (PLAN_SLUGS as readonly string[]).includes(value);
}

export {
  canCreateMovie,
  canInviteMember,
  canUseAdvancedTheme,
  canCreateFamily,
  canUseFaceDetection,
  canCreatePerson,
  canGenerateAiSoundtrack,
  countAiSoundtracksThisMonth,
  getPlanCapabilities,
  countFamilyMemberSeats,
  countUserPeople,
  assertGateAllowed,
  PlanGateError,
  isAdvancedMovieTheme,
  ADVANCED_MOVIE_THEMES,
  type PlanGateCode,
  type PlanGateResult,
  type PlanCapabilities,
  type AdvancedMovieTheme,
} from "@/lib/plans/gates";

