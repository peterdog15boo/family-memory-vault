import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  serializeTrustDraft,
  updateTrustFundingChecklist,
} from "@/lib/trust-planner/server";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  draftId: z.string().min(1).max(64),
  checks: z.record(z.string().min(1).max(64), z.boolean()),
});

/**
 * PATCH /api/legacy/trust/checklist — persist funding/signing task checks.
 * Unchecking never deletes a signed-scan upload.
 */
export async function PATCH(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `trust-planner-checklist:${userId}`,
    RATE_LIMITS.trustPlannerMutate.limit,
    RATE_LIMITS.trustPlannerMutate.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid checklist update", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const draft = await updateTrustFundingChecklist({
      userId,
      draftId: parsed.data.draftId,
      checks: parsed.data.checks,
    });
    return NextResponse.json({ draft: serializeTrustDraft(draft) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update checklist";
    if (message.includes("not found")) {
      return apiError(message, { status: 404, code: "not_found" });
    }
    return apiErrorFromUnknown(error, "Failed to update checklist");
  }
}
