import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { ensureAppUser } from "@/lib/users";
import {
  createBillingPortalSession,
  isStripeConfigured,
  StripeBillingError,
} from "@/lib/stripe";

/**
 * POST /api/billing/portal
 * Opens the Stripe Customer Portal to manage payment methods / cancel.
 */
export async function POST() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `billing-portal:${userId}`,
    RATE_LIMITS.billing.limit,
    RATE_LIMITS.billing.windowMs,
  );
  if (limited) return limited;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error:
          "Billing is not configured yet. Add STRIPE_SECRET_KEY to .env.local.",
        code: "stripe_not_configured",
      },
      { status: 503 },
    );
  }

  try {
    await ensureAppUser(userId);
    const session = await createBillingPortalSession(userId);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof StripeBillingError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 },
      );
    }
    console.error("[billing.portal] failed", error);
    return NextResponse.json(
      { error: "Failed to open billing portal" },
      { status: 500 },
    );
  }
}
