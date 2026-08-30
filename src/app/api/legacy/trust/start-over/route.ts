import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  archiveActiveTrustDraft,
  createTrustDraft,
  hasAcceptedTrustDisclaimer,
  serializeTrustDraft,
  TRUST_DISCLAIMER_VERSION,
} from "@/lib/trust-planner/server";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  confirm: z.literal(true),
});

/** POST /api/legacy/trust/start-over — archive active draft and start fresh. */
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
    return apiError("Confirm start over to continue.", {
      status: 400,
      code: "validation",
    });
  }

  try {
    const accepted = await hasAcceptedTrustDisclaimer(userId);
    if (!accepted) {
      return apiError(
        "Please accept the Trust Planner disclaimer before starting.",
        { status: 403, code: "disclaimer_required" },
      );
    }

    const { archivedId } = await archiveActiveTrustDraft(userId);
    const draft = await createTrustDraft({
      userId,
      disclaimerVersion: TRUST_DISCLAIMER_VERSION,
    });

    return NextResponse.json({
      archivedId,
      draft: serializeTrustDraft(draft),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to start over");
  }
}
