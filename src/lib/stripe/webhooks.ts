/**
 * Stripe webhook event handling — signature verified by the route; handlers are
 * idempotent via stripe_webhook_events (event.id claim) + subscription upserts.
 */

import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { stripeWebhookEvents } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe/client";
import { getStripeWebhookSecret } from "@/lib/stripe/config";
import {
  downgradeToFreeFromStripe,
  retrieveStripeSubscription,
  syncStripeSubscription,
  userIdFromCheckoutSession,
  StripeBillingError,
} from "@/lib/stripe/subscriptions";

export function constructStripeEvent(
  rawBody: string | Buffer,
  signature: string | null,
): Stripe.Event {
  const secret = getStripeWebhookSecret();
  if (!secret) {
    throw new StripeBillingError(
      "STRIPE_WEBHOOK_SECRET is not set.",
      "webhook_secret_missing",
    );
  }
  if (!signature) {
    throw new StripeBillingError(
      "Missing Stripe-Signature header.",
      "missing_signature",
    );
  }

  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Claim an event id before handling. Returns false if already processed.
 * On handler failure, release the claim so Stripe can retry.
 */
export async function claimStripeWebhookEvent(
  event: Stripe.Event,
): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(stripeWebhookEvents)
    .values({
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date(),
    })
    .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
    .returning({ eventId: stripeWebhookEvents.eventId });

  return inserted.length > 0;
}

export async function releaseStripeWebhookEventClaim(
  eventId: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, eventId));
}

export async function handleStripeWebhookEvent(
  event: Stripe.Event,
): Promise<{ handled: boolean; detail?: string; duplicate?: boolean }> {
  const claimed = await claimStripeWebhookEvent(event);
  if (!claimed) {
    return {
      handled: true,
      duplicate: true,
      detail: `already processed ${event.id}`,
    };
  }

  try {
    return await dispatchStripeWebhookEvent(event);
  } catch (error) {
    await releaseStripeWebhookEventClaim(event.id);
    throw error;
  }
}

async function dispatchStripeWebhookEvent(
  event: Stripe.Event,
): Promise<{ handled: boolean; detail?: string }> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") {
        return { handled: true, detail: "ignored non-subscription checkout" };
      }
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (!subscriptionId) {
        return { handled: true, detail: "checkout without subscription id" };
      }
      const userId = userIdFromCheckoutSession(session);
      const stripeSub = await retrieveStripeSubscription(subscriptionId);
      await syncStripeSubscription(stripeSub, userId);
      return { handled: true, detail: `synced checkout ${session.id}` };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSub = event.data.object as Stripe.Subscription;
      await syncStripeSubscription(stripeSub);
      return { handled: true, detail: `synced ${event.type}` };
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof stripeSub.customer === "string"
          ? stripeSub.customer
          : stripeSub.customer?.id;
      await downgradeToFreeFromStripe({
        stripeSubscriptionId: stripeSub.id,
        stripeCustomerId: customerId,
        userId: stripeSub.metadata?.userId ?? null,
      });
      return { handled: true, detail: "downgraded to free" };
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) {
        return { handled: true, detail: "invoice without subscription" };
      }
      const stripeSub = await retrieveStripeSubscription(subscriptionId);
      await syncStripeSubscription(stripeSub);
      return { handled: true, detail: `synced from ${event.type}` };
    }

    default:
      return { handled: false, detail: `unhandled ${event.type}` };
  }
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // Stripe API shapes vary by version — support common fields safely.
  const raw = invoice as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
    parent?: {
      subscription_details?: {
        subscription?: string | { id: string } | null;
      } | null;
    } | null;
  };

  const direct = raw.subscription;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object" && "id" in direct) return direct.id;

  const nested = raw.parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object" && "id" in nested) return nested.id;

  return null;
}
