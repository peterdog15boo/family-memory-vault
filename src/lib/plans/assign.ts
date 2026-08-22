/**
 * Shared plan assignment (admin override, beta testing, free bootstrap).
 * Does not talk to Stripe — Stripe sync owns paid `plan_source = 'stripe'`.
 */

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { subscriptions, type PlanSlug } from "@/lib/db/schema";
import {
  getPlanBySlug,
  seedPlans,
  startOfUtcMonth,
} from "@/lib/plans";

export const PLAN_SOURCES = ["beta", "admin", "stripe", "free"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export type AssignUserPlanResult = {
  planSlug: string;
  planName: string;
  previousPlanId: string | null;
  planSource: PlanSource;
};

/**
 * Upsert the user's subscription to a catalog plan without Stripe.
 * Preserves existing stripeCustomerId / stripeSubscriptionId columns.
 */
export async function assignUserPlan(
  userId: string,
  planSlug: string,
  options: { source: PlanSource },
): Promise<AssignUserPlanResult> {
  if (!userId?.trim()) {
    throw new Error("userId is required");
  }

  await seedPlans();
  const plan = await getPlanBySlug(planSlug);
  if (!plan) {
    throw new Error(`Unknown plan slug: ${planSlug}`);
  }

  const db = getDb();
  const now = new Date();
  const billingInterval =
    plan.slug === "free" || plan.priceMonthlyCents === 0 ? "none" : "monthly";

  const [prior] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (prior) {
    await db
      .update(subscriptions)
      .set({
        planId: plan.id,
        status: "active",
        billingInterval,
        currentPeriodStart: startOfUtcMonth(now),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        planSource: options.source,
        planAssignedAt: now,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, prior.id));
  } else {
    await db.insert(subscriptions).values({
      id: nanoid(),
      userId,
      familyId: null,
      planId: plan.id,
      status: "active",
      billingInterval,
      currentPeriodStart: startOfUtcMonth(now),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      planSource: options.source,
      planAssignedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.info("[plans.assign]", {
    userId,
    planSlug: plan.slug,
    source: options.source,
    previousPlanId: prior?.planId ?? null,
  });

  return {
    planSlug: plan.slug,
    planName: plan.name,
    previousPlanId: prior?.planId ?? null,
    planSource: options.source,
  };
}

export function isAssignablePlanSlug(value: string): value is PlanSlug {
  return (
    value === "free" ||
    value === "family" ||
    value === "family_plus" ||
    value === "legacy"
  );
}
