import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { isPlaidConfigured } from "@/lib/plaid/config";
import { syncPlaidItemForUser } from "@/lib/plaid/service";
import { enqueueJob } from "@/lib/queue";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

const bodySchema = z.object({
  itemId: z.string().min(1).max(64),
  /** When true, enqueue a background job instead of syncing inline. */
  async: z.boolean().optional(),
});

/**
 * POST /api/accounts/sync — refresh balances/holdings for one Plaid item.
 */
export async function POST(request: Request) {
  const originBlock = rejectUntrustedOrigin(request);
  if (originBlock) return originBlock;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `accounts-sync:${userId}`,
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

    if (parsed.data.async) {
      await enqueueJob({
        type: "plaid.sync",
        payload: { userId, itemId: parsed.data.itemId },
        maxAttempts: 3,
      });
      return NextResponse.json({ ok: true, queued: true });
    }

    const result = await syncPlaidItemForUser(userId, parsed.data.itemId);
    return NextResponse.json({ ok: true, queued: false, ...result });
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not sync accounts.");
  }
}
