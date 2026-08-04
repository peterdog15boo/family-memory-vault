/**
 * Eagerly apply a completed Checkout Session to our subscriptions row
 * (so the success page shows the new plan without waiting on webhooks).
 */

import { getStripe } from "@/lib/stripe/client";
import {
  syncStripeSubscription,
  StripeBillingError,
} from "@/lib/stripe/subscriptions";

export async function syncCheckoutSessionForUser(
  userId: string,
  sessionId: string,
) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  const sessionUser =
    session.client_reference_id || session.metadata?.userId || null;
  if (sessionUser && sessionUser !== userId) {
    throw new StripeBillingError(
      "This checkout session belongs to a different account.",
      "session_mismatch",
    );
  }

  if (session.mode !== "subscription") {
    throw new StripeBillingError(
      "Checkout session is not a subscription.",
      "invalid_session",
    );
  }

  if (session.status !== "complete" && session.payment_status !== "paid") {
    throw new StripeBillingError(
      "Checkout session is not complete yet.",
      "session_incomplete",
    );
  }

  const subscriptionRef = session.subscription;
  const subscriptionId =
    typeof subscriptionRef === "string"
      ? subscriptionRef
      : subscriptionRef?.id;

  if (!subscriptionId) {
    throw new StripeBillingError(
      "Checkout session has no subscription yet.",
      "missing_subscription",
    );
  }

  const subscription =
    typeof subscriptionRef === "object" && subscriptionRef
      ? subscriptionRef
      : await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });

  return syncStripeSubscription(subscription, userId);
}
