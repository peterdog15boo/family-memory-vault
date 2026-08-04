import { NextResponse } from "next/server";
import {
  constructStripeEvent,
  handleStripeWebhookEvent,
  isStripeConfigured,
  StripeBillingError,
} from "@/lib/stripe";
import {
  logBillingWebhook,
  logBillingWebhookFailed,
} from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";

/** Signature / config errors — do not retry forever with the same bad payload. */
const CLIENT_WEBHOOK_CODES = new Set([
  "webhook_secret_missing",
  "missing_signature",
  "stripe_not_configured",
]);

/**
 * POST /api/stripe/webhook
 *
 * Stripe sends subscription lifecycle events here.
 * Verify with STRIPE_WEBHOOK_SECRET — do not require Clerk auth.
 * Events are claimed by id in stripe_webhook_events for idempotency.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured", code: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid webhook signature";
    logger.error("billing.webhook_signature_failed", { message });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await handleStripeWebhookEvent(event);
    logBillingWebhook({
      type: event.type,
      eventId: event.id,
      ...result,
    });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    if (error instanceof StripeBillingError) {
      logBillingWebhookFailed(
        {
          eventId: event.id,
          type: event.type,
          code: error.code,
        },
        error,
      );
      // Transient / fixable sync issues (e.g. missing_user) → 500 so Stripe retries.
      // Claim is released inside handleStripeWebhookEvent so retries are safe.
      const status = CLIENT_WEBHOOK_CODES.has(error.code) ? 400 : 500;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    logBillingWebhookFailed(
      {
        eventId: event.id,
        type: event.type,
      },
      error,
    );
    return NextResponse.json(
      { error: "Webhook handler failed", code: "internal" },
      { status: 500 },
    );
  }
}
