import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import { listConnectedAccountsForUser } from "@/lib/plaid/service";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

/**
 * GET /api/accounts — list owner-scoped linked financial accounts.
 */
export async function GET() {
  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `accounts-list:${userId}`,
    RATE_LIMITS.plaidList.limit,
    RATE_LIMITS.plaidList.windowMs,
  );
  if (limited) return limited;

  try {
    await ensureAppUser(userId);
    const data = await listConnectedAccountsForUser(userId);
    return NextResponse.json(data);
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not load connected accounts.");
  }
}
