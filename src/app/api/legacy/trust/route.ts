import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  createTrustDraft,
  getActiveTrustDraft,
  hasAcceptedTrustDisclaimer,
  serializeTrustDraft,
  TRUST_DISCLAIMER_VERSION,
  TRUST_STEPS,
  updateTrustDraftAnswers,
  visibleTrustSteps,
  type TrustAnswers,
  type TrustStepId,
} from "@/lib/trust-planner/server";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const stepIds = TRUST_STEPS.map((s) => s.id) as [TrustStepId, ...TrustStepId[]];

const patchSchema = z.object({
  draftId: z.string().min(1).max(64),
  stepId: z.enum(stepIds).optional(),
  answers: z.record(z.string(), z.unknown()),
});

/** GET /api/legacy/trust — active draft + disclaimer status. */
export async function GET() {
  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const [draft, disclaimerAccepted] = await Promise.all([
      getActiveTrustDraft(authResult.userId),
      hasAcceptedTrustDisclaimer(authResult.userId),
    ]);

    return NextResponse.json({
      disclaimerVersion: TRUST_DISCLAIMER_VERSION,
      disclaimerAccepted,
      draft: draft ? serializeTrustDraft(draft) : null,
      steps: TRUST_STEPS.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
      })),
      visibleStepIds: draft
        ? visibleTrustSteps(serializeTrustDraft(draft).answers)
        : visibleTrustSteps({}),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load trust planner");
  }
}

/** POST /api/legacy/trust — start a draft (requires prior disclaimer acceptance). */
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

  try {
    const accepted = await hasAcceptedTrustDisclaimer(userId);
    if (!accepted) {
      return apiError(
        "Please accept the Trust Planner disclaimer before starting.",
        { status: 403, code: "disclaimer_required" },
      );
    }

    const draft = await createTrustDraft({
      userId,
      disclaimerVersion: TRUST_DISCLAIMER_VERSION,
    });

    return NextResponse.json({ draft: serializeTrustDraft(draft) });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to start trust planner");
  }
}

/** PATCH /api/legacy/trust — save answers after a step. */
export async function PATCH(request: Request) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid trust planner update", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const draft = await updateTrustDraftAnswers({
      userId,
      draftId: parsed.data.draftId,
      answers: parsed.data.answers as TrustAnswers,
      stepId: parsed.data.stepId,
    });
    return NextResponse.json({ draft: serializeTrustDraft(draft) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save trust draft";
    if (message.includes("not found")) {
      return apiError(message, { status: 404, code: "not_found" });
    }
    return apiErrorFromUnknown(error, "Failed to save trust draft");
  }
}
