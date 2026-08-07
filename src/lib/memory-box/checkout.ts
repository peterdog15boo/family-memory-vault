/**
 * One-time Stripe Checkout for Family Memory Box ($199).
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  MEMORY_BOX_PRICE_CENTS,
  memoryBoxOrders,
  type MemoryBoxOrder,
} from "@/lib/db/schema";
import { getAppUrl } from "@/lib/env";
import { formatMemoryBoxPrice } from "@/lib/memory-box/constants";
import { getStripe } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/stripe/config";
import { StripeBillingError } from "@/lib/stripe/subscriptions";

function resolveMemoryBoxPriceId(): string | null {
  return process.env.STRIPE_PRICE_MEMORY_BOX?.trim() || null;
}

/**
 * Create a one-time Checkout Session for a saved Memory Box order.
 * Marks the order checkout_pending and stores the session id.
 */
export async function createMemoryBoxCheckoutSession(
  order: MemoryBoxOrder,
): Promise<{ url: string; sessionId: string }> {
  if (!isStripeConfigured()) {
    throw new StripeBillingError(
      "Stripe is not configured.",
      "stripe_not_configured",
    );
  }

  const appUrl = getAppUrl();
  const priceId = resolveMemoryBoxPriceId();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: order.priceCents || MEMORY_BOX_PRICE_CENTS,
            product_data: {
              name: "Family Memory Box",
              description:
                "Physical media digitizing — files appear in your Photos page when ready.",
            },
          },
        },
      ];

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.email,
    client_reference_id: order.userId || order.id,
    line_items: lineItems,
    success_url: `${appUrl}/family-memory-box/success?order_id=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/family-memory-box?checkout=cancelled#order`,
    billing_address_collection: "auto",
    metadata: {
      kind: "memory_box",
      memoryBoxOrderId: order.id,
      userId: order.userId ?? "",
    },
    payment_intent_data: {
      metadata: {
        kind: "memory_box",
        memoryBoxOrderId: order.id,
        userId: order.userId ?? "",
      },
    },
  });

  if (!session.url) {
    throw new StripeBillingError(
      "Stripe Checkout session missing URL.",
      "missing_checkout_url",
    );
  }

  const db = getDb();
  await db
    .update(memoryBoxOrders)
    .set({
      paymentStatus: "checkout_pending",
      stripeCheckoutSessionId: session.id,
      updatedAt: new Date(),
    })
    .where(eq(memoryBoxOrders.id, order.id));

  return { url: session.url, sessionId: session.id };
}

/**
 * Mark a Memory Box order paid after a completed Checkout Session.
 * Idempotent if already paid.
 */
export async function markMemoryBoxOrderPaidFromCheckout(
  session: Stripe.Checkout.Session,
): Promise<MemoryBoxOrder | null> {
  const orderId =
    session.metadata?.memoryBoxOrderId?.trim() ||
    (session.client_reference_id?.startsWith("user_")
      ? null
      : session.client_reference_id?.trim()) ||
    null;

  if (!orderId && !session.id) return null;

  const db = getDb();
  const [existing] = orderId
    ? await db
        .select()
        .from(memoryBoxOrders)
        .where(eq(memoryBoxOrders.id, orderId))
        .limit(1)
    : await db
        .select()
        .from(memoryBoxOrders)
        .where(eq(memoryBoxOrders.stripeCheckoutSessionId, session.id))
        .limit(1);

  if (!existing) {
    console.error("[memory-box] checkout paid but order not found", {
      sessionId: session.id,
      orderId,
    });
    return null;
  }

  if (existing.paymentStatus === "paid") {
    return existing;
  }

  if (
    session.payment_status !== "paid" &&
    session.status !== "complete"
  ) {
    throw new StripeBillingError(
      "Checkout session is not paid.",
      "session_unpaid",
    );
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const [updated] = await db
    .update(memoryBoxOrders)
    .set({
      paymentStatus: "paid",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(memoryBoxOrders.id, existing.id))
    .returning();

  return updated ?? null;
}

/**
 * Confirm payment from the success page (does not wait only on webhooks).
 */
export async function confirmMemoryBoxCheckoutSession(options: {
  orderId: string;
  sessionId: string;
}): Promise<MemoryBoxOrder> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(options.sessionId);

  const metaOrderId = session.metadata?.memoryBoxOrderId?.trim();
  if (metaOrderId && metaOrderId !== options.orderId) {
    throw new StripeBillingError(
      "Checkout session does not match this order.",
      "session_mismatch",
    );
  }

  if (session.mode !== "payment") {
    throw new StripeBillingError(
      "Checkout session is not a Memory Box payment.",
      "invalid_session",
    );
  }

  const paid = await markMemoryBoxOrderPaidFromCheckout(session);
  if (!paid || paid.id !== options.orderId) {
    throw new StripeBillingError(
      "Could not confirm Memory Box payment for this order.",
      "confirm_failed",
    );
  }
  return paid;
}

export function memoryBoxCheckoutAmountLabel(priceCents = MEMORY_BOX_PRICE_CENTS) {
  return formatMemoryBoxPrice(priceCents);
}
