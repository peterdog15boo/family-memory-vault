import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  generateAndSaveTrustDraft,
  serializeTrustDraft,
  TrustGenerateValidationError,
} from "@/lib/trust-planner/server";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  draftId: z.string().min(1).max(64),
});

/** POST /api/legacy/trust/generate — build planning stub markdown. */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `trust-planner:${userId}`,
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid generate request", {
      status: 400,
      code: "validation",
    });
  }

  try {
    const draft = await generateAndSaveTrustDraft({
      userId,
      draftId: parsed.data.draftId,
    });
    return NextResponse.json({ draft: serializeTrustDraft(draft) });
  } catch (error) {
    if (error instanceof TrustGenerateValidationError) {
      return apiError(error.message, {
        status: 400,
        code: "validation",
      });
    }
    const message =
      error instanceof Error ? error.message : "Failed to generate draft";
    if (message.includes("not found")) {
      return apiError(message, { status: 404, code: "not_found" });
    }
    return apiErrorFromUnknown(error, "Failed to generate draft");
  }
}
