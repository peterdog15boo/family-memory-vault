/**
 * Checkout + Customer Portal session helpers.
 */

import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import {
  getAppUrl,
  isPaidPlanSlug,
  isBillingInterval,
  resolvePriceId,
  type BillingInterval,
  type PaidPlanSlug,
} from "@/lib/stripe/config";
import {
  ensureStripeCustomer,
  StripeBillingError,
} from "@/lib/stripe/subscriptions";

export type CreateCheckoutInput = {
  userId: string;
  planSlug: PaidPlanSlug;
  interval: BillingInterval;
  /** Absolute or path success URL override. */
  successUrl?: string;
  cancelUrl?: string;
};

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<Stripe.Checkout.Session> {
  if (!isPaidPlanSlug(input.planSlug)) {
    throw new StripeBillingError(
      "Only Family and Family Plus can be purchased via Stripe.",
      "invalid_plan",
    );
  }
  if (!isBillingInterval(input.interval)) {
    throw new StripeBillingError(
      "Billing interval must be monthly or yearly.",
      "invalid_interval",
    );
  }

  const priceId = resolvePriceId(input.planSlug, input.interval);
  if (!priceId) {
    throw new StripeBillingError(
      `Stripe price is not configured for ${input.planSlug} (${input.interval}). Set the STRIPE_PRICE_* env vars.`,
      "price_not_configured",
    );
  }

  const { customerId } = await ensureStripeCustomer(input.userId);
  const appUrl = getAppUrl();
  const successUrl =
    input.successUrl ??
    `${appUrl}/pricing/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = input.cancelUrl ?? `${appUrl}/pricing`;

  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: input.userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    metadata: {
      userId: input.userId,
      planSlug: input.planSlug,
      interval: input.interval,
    },
    subscription_data: {
      metadata: {
        userId: input.userId,
        planSlug: input.planSlug,
        interval: input.interval,
      },
    },
  });
}

export async function createBillingPortalSession(userId: string): Promise<{
  url: string;
}> {
  const { customerId } = await ensureStripeCustomer(userId);
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getAppUrl()}/billing?billing=portal`,
  });
  if (!session.url) {
    throw new StripeBillingError("Stripe portal session missing URL.");
  }
  return { url: session.url };
}
