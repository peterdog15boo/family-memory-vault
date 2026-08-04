import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { ensureAppUser } from "@/lib/users";
import {
  createCheckoutSession,
  isBillingInterval,
  isPaidPlanSlug,
  isStripeConfigured,
  StripeBillingError,
} from "@/lib/stripe";

const bodySchema = z.object({
  planSlug: z.enum(["family", "family_plus"]),
  interval: z.enum(["monthly", "yearly"]),
});

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout session for upgrading to a paid plan.
 * Free plan does not use Stripe — never call this for `free` / `legacy`.
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `billing-checkout:${userId}`,
    RATE_LIMITS.billing.limit,
    RATE_LIMITS.billing.windowMs,
  );
  if (limited) return limited;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Billing is not configured yet. Add STRIPE_SECRET_KEY and price IDs to .env.local.",
        code: "stripe_not_configured",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid checkout request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { planSlug, interval } = parsed.data;
  if (!isPaidPlanSlug(planSlug) || !isBillingInterval(interval)) {
    return NextResponse.json({ error: "Invalid plan or interval" }, { status: 400 });
  }

  try {
    await ensureAppUser(userId);
    const session = await createCheckoutSession({
      userId,
      planSlug,
      interval,
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    if (error instanceof StripeBillingError) {
      const status = error.code === "price_not_configured" ? 503 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    console.error("[billing.checkout] failed", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
