import { NextResponse } from "next/server";
import { z } from "zod";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { disconnectPlaidItemForUser } from "@/lib/plaid/service";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { requireSensitiveStepUp } from "@/lib/security/sensitive-access";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

const bodySchema = z.object({
  itemId: z.string().min(1).max(64),
  confirmed: z.boolean().optional(),
});

/**
 * POST /api/accounts/disconnect — remove Plaid item + local financial data.
 */
export async function POST(request: Request) {
  const originBlock = rejectUntrustedOrigin(request);
  if (originBlock) return originBlock;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError("Invalid body", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;

  const stepUp = await requireSensitiveStepUp({
    allowExplicitConfirm: true,
    confirmed: parsed.data.confirmed === true,
  });
  if (!stepUp.ok) return stepUp.response;
  const { userId } = stepUp;

  const limited = enforceRateLimit(
    `accounts-disconnect:${userId}`,
    RATE_LIMITS.plaidMutate.limit,
    RATE_LIMITS.plaidMutate.windowMs,
  );
  if (limited) return limited;

  try {
    await ensureAppUser(userId);
    await disconnectPlaidItemForUser(userId, parsed.data.itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not disconnect account.");
  }
}
