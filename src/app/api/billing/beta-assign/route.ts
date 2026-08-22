import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  betaPlanSuccessMessage,
  isBetaBillingOverride,
} from "@/lib/billing/beta-flags";
import {
  assignUserPlan,
  isAssignablePlanSlug,
} from "@/lib/plans/assign";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

const bodySchema = z.object({
  planSlug: z.enum(["free", "family", "family_plus", "legacy"]),
});

/**
 * POST /api/billing/beta-assign
 *
 * Beta-only: assign a catalog plan with no Stripe Checkout / charges.
 * Disabled when BETA_BILLING_OVERRIDE is off (returns 404).
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  // Dormant when flag is off — do not leak that the endpoint exists in prod.
  if (!isBetaBillingOverride()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `billing-beta-assign:${userId}`,
    RATE_LIMITS.billing.limit,
    RATE_LIMITS.billing.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !isAssignablePlanSlug(parsed.data.planSlug)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  try {
    await ensureAppUser(userId);
    const result = await assignUserPlan(userId, parsed.data.planSlug, {
      source: "beta",
    });

    console.info("[billing.beta-assign] plan switched", {
      userId,
      planSlug: result.planSlug,
      previousPlanId: result.previousPlanId,
    });

    revalidatePath("/billing");
    revalidatePath("/pricing");
    revalidatePath("/dashboard");
    revalidatePath("/documents");
    revalidatePath("/legacy");
    revalidatePath("/accounts");
    revalidatePath("/family");
    revalidatePath("/upload");
    revalidatePath("/", "layout");

    return NextResponse.json({
      ok: true,
      beta: true,
      charged: false,
      planSlug: result.planSlug,
      planName: result.planName,
      message: `${betaPlanSuccessMessage(result.planName)} You will not be charged. No payment info is required.`,
    });
  } catch (error) {
    console.error("[billing.beta-assign] failed", error);
    return NextResponse.json(
      { error: "Could not update plan for beta testing." },
      { status: 500 },
    );
  }
}
