import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { isPlaidConfigured } from "@/lib/plaid/config";
import { createLinkTokenForUser } from "@/lib/plaid/service";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

/**
 * POST /api/plaid/link-token — create a short-lived Plaid Link token.
 */
export async function POST(request: Request) {
  const originBlock = rejectUntrustedOrigin(request);
  if (originBlock) return originBlock;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `plaid-link:${userId}`,
    RATE_LIMITS.plaidLink.limit,
    RATE_LIMITS.plaidLink.windowMs,
  );
  if (limited) return limited;

  if (!isPlaidConfigured()) {
    return apiError("Plaid is not configured on this environment.", {
      status: 503,
      code: "plaid_not_configured",
    });
  }

  try {
    await ensureAppUser(userId);
    const linkToken = await createLinkTokenForUser(userId);
    return NextResponse.json({ linkToken });
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not create Plaid Link token.");
  }
}
