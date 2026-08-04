/**
 * Sync Stripe subscription objects into our `subscriptions` table.
 * Free plan remains fully usable without any Stripe objects.
 */

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import {
  plans,
  subscriptions,
  users,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/db/schema";
import { getPlanBySlug, seedPlans } from "@/lib/plans";
import {
  resolvePlanFromPriceId,
  type BillingInterval,
} from "@/lib/stripe/config";
import { getStripe } from "@/lib/stripe/client";

export class StripeBillingError extends Error {
  readonly code: string;

  constructor(message: string, code = "stripe_error") {
    super(message);
    this.name = "StripeBillingError";
    this.code = code;
  }
}

function unixToDate(seconds: number | null | undefined): Date | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "paused":
      return "past_due";
    default:
      return "incomplete";
  }
}

function primarySubscriptionItem(
  sub: Stripe.Subscription,
): Stripe.SubscriptionItem | null {
  return sub.items?.data?.[0] ?? null;
}

function priceIdFromSubscription(sub: Stripe.Subscription): string | null {
  const item = primarySubscriptionItem(sub);
  const price = item?.price;
  if (!price) return null;
  return typeof price === "string" ? price : price.id;
}

function periodFromSubscription(sub: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  const item = primarySubscriptionItem(sub);
  return {
    start: unixToDate(item?.current_period_start),
    end: unixToDate(item?.current_period_end),
  };
}

async function getUserEmail(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}

/**
 * Find our subscription row by Stripe customer or subscription id.
 */
export async function findSubscriptionByStripeIds(opts: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  userId?: string | null;
}): Promise<Subscription | null> {
  const db = getDb();

  if (opts.stripeSubscriptionId) {
    const [bySub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, opts.stripeSubscriptionId))
      .limit(1);
    if (bySub) return bySub;
  }

  if (opts.userId) {
    const [byUser] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, opts.userId))
      .limit(1);
    if (byUser) return byUser;
  }

  if (opts.stripeCustomerId) {
    const [byCustomer] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, opts.stripeCustomerId))
      .limit(1);
    if (byCustomer) return byCustomer;
  }

  return null;
}

/**
 * Ensure a Stripe Customer exists for the user and is stored on their
 * subscription row. Creates a Free subscription row first if needed.
 */
export async function ensureStripeCustomer(userId: string): Promise<{
  customerId: string;
  subscription: Subscription;
}> {
  await seedPlans();
  const { ensureFreeSubscription } = await import("@/lib/plans");
  let row = await ensureFreeSubscription(userId);

  if (row.stripeCustomerId) {
    return { customerId: row.stripeCustomerId, subscription: row };
  }

  const email = await getUserEmail(userId);
  if (!email) {
    throw new StripeBillingError(
      "User email is required to create a Stripe customer.",
      "missing_email",
    );
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  const db = getDb();
  const [updated] = await db
    .update(subscriptions)
    .set({
      stripeCustomerId: customer.id,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, row.id))
    .returning();

  return {
    customerId: customer.id,
    subscription: updated ?? { ...row, stripeCustomerId: customer.id },
  };
}

/**
 * Apply a live Stripe subscription onto our DB row (paid plan).
 */
export async function syncStripeSubscription(
  stripeSub: Stripe.Subscription,
  explicitUserId?: string | null,
): Promise<Subscription> {
  await seedPlans();

  const priceId = priceIdFromSubscription(stripeSub);
  const mapped = resolvePlanFromPriceId(priceId);
  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer?.id;

  const userId =
    explicitUserId ||
    stripeSub.metadata?.userId ||
    (await findSubscriptionByStripeIds({
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSub.id,
    }))?.userId;

  if (!userId) {
    throw new StripeBillingError(
      `Cannot sync Stripe subscription ${stripeSub.id}: missing userId metadata.`,
      "missing_user",
    );
  }

  const status = mapStripeStatus(stripeSub.status);
  const period = periodFromSubscription(stripeSub);
  const now = new Date();

  const isTerminalCancel =
    stripeSub.status === "canceled" ||
    stripeSub.status === "unpaid" ||
    stripeSub.status === "incomplete_expired";

  let planId: string;
  let billingInterval: BillingInterval | "none";
  let stripePriceId: string | null = priceId;
  let stripeSubscriptionId: string | null = stripeSub.id;
  let dbStatus: SubscriptionStatus = status;

  if (isTerminalCancel || !mapped) {
    const free = await getPlanBySlug("free");
    if (!free) throw new StripeBillingError("Free plan missing from database.");
    planId = free.id;
    billingInterval = "none";
    dbStatus = "active"; // Free entitlement remains active without Stripe.
    stripeSubscriptionId = null;
    stripePriceId = null;
  } else {
    const [plan] = await getDb()
      .select()
      .from(plans)
      .where(eq(plans.slug, mapped.planSlug))
      .limit(1);
    if (!plan) {
      throw new StripeBillingError(
        `Plan slug ${mapped.planSlug} not found for price ${priceId}.`,
      );
    }
    planId = plan.id;
    billingInterval = mapped.interval;
  }

  const db = getDb();
  const existing = await findSubscriptionByStripeIds({
    stripeSubscriptionId: stripeSub.id,
    stripeCustomerId: customerId,
    userId,
  });

  const patch = {
    userId,
    planId,
    status: dbStatus,
    billingInterval,
    currentPeriodStart: period.start,
    currentPeriodEnd: isTerminalCancel ? null : period.end,
    cancelAtPeriodEnd: isTerminalCancel
      ? false
      : Boolean(stripeSub.cancel_at_period_end),
    canceledAt: isTerminalCancel
      ? unixToDate(stripeSub.canceled_at) ?? now
      : unixToDate(stripeSub.canceled_at),
    trialEndsAt: unixToDate(stripeSub.trial_end),
    stripeCustomerId: customerId ?? existing?.stripeCustomerId ?? null,
    stripeSubscriptionId,
    stripePriceId,
    updatedAt: now,
  };

  if (existing) {
    const [updated] = await db
      .update(subscriptions)
      .set(patch)
      .where(eq(subscriptions.id, existing.id))
      .returning();
    if (!updated) {
      throw new StripeBillingError("Failed to update subscription row.");
    }
    return updated;
  }

  const [created] = await db
    .insert(subscriptions)
    .values({
      id: nanoid(),
      familyId: null,
      createdAt: now,
      ...patch,
    })
    .returning();

  if (!created) {
    throw new StripeBillingError("Failed to insert subscription row.");
  }
  return created;
}

/**
 * Mark the user's subscription as Free after Stripe subscription deletion.
 */
export async function downgradeToFreeFromStripe(opts: {
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  userId?: string | null;
}): Promise<Subscription | null> {
  await seedPlans();
  const free = await getPlanBySlug("free");
  if (!free) throw new StripeBillingError("Free plan missing from database.");

  const existing = await findSubscriptionByStripeIds(opts);
  if (!existing) return null;

  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(subscriptions)
    .set({
      planId: free.id,
      status: "active",
      billingInterval: "none",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: now,
      stripeSubscriptionId: null,
      stripePriceId: null,
      // Keep stripeCustomerId so they can re-subscribe via portal/checkout.
      updatedAt: now,
    })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  return updated ?? null;
}

/**
 * Resolve Clerk user id from a Checkout Session.
 */
export function userIdFromCheckoutSession(
  session: Stripe.Checkout.Session,
): string | null {
  return (
    session.client_reference_id ||
    session.metadata?.userId ||
    null
  );
}

export async function retrieveStripeSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
}
