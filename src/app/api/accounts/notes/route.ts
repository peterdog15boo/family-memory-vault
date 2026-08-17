import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { updateLinkedAccountNotes } from "@/lib/plaid/service";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

const bodySchema = z.object({
  accountId: z.string().min(1).max(64),
  notes: z.string().max(4000).nullable(),
});

/**
 * PATCH /api/accounts/notes — owner notes (insurance agent, policy info, etc.).
 */
export async function PATCH(request: Request) {
  const originBlock = rejectUntrustedOrigin(request);
  if (originBlock) return originBlock;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `accounts-notes:${userId}`,
    RATE_LIMITS.plaidMutate.limit,
    RATE_LIMITS.plaidMutate.windowMs,
  );
  if (limited) return limited;

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
    const account = await updateLinkedAccountNotes(
      userId,
      parsed.data.accountId,
      parsed.data.notes,
    );
    if (!account) {
      return apiError("Account not found", { status: 404, code: "not_found" });
    }
    return NextResponse.json({ ok: true, account });
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not save notes.");
  }
}
