import { NextResponse } from "next/server";
import { z } from "zod";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { isPlaidConfigured } from "@/lib/plaid/config";
import { exchangePublicTokenForUser } from "@/lib/plaid/service";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

const bodySchema = z.object({
  publicToken: z.string().min(1).max(512),
});

/**
 * POST /api/plaid/exchange — exchange public_token → encrypted access_token.
 */
export async function POST(request: Request) {
  const originBlock = rejectUntrustedOrigin(request);
  if (originBlock) return originBlock;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `plaid-exchange:${userId}`,
    RATE_LIMITS.plaidMutate.limit,
    RATE_LIMITS.plaidMutate.windowMs,
  );
  if (limited) return limited;

  if (!isPlaidConfigured()) {
    return apiError("Plaid is not configured on this environment.", {
      status: 503,
      code: "plaid_not_configured",
    });
  }

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

  try {
    await ensureAppUser(userId);
    const result = await exchangePublicTokenForUser(
      userId,
      parsed.data.publicToken,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not connect account.");
  }
}
