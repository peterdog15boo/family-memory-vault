import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  createWillDraft,
  getActiveWillDraft,
  hasAcceptedWillDisclaimer,
  serializeWillDraft,
  updateWillDraftAnswers,
  visibleWillSteps,
  WILL_DISCLAIMER_VERSION,
  WILL_STEPS,
  type WillAnswers,
  type WillStepId,
} from "@/lib/will-planner/server";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const stepIds = WILL_STEPS.map((s) => s.id) as [WillStepId, ...WillStepId[]];

const patchSchema = z.object({
  draftId: z.string().min(1).max(64),
  stepId: z.enum(stepIds).optional(),
  answers: z.record(z.string(), z.unknown()),
});

/** GET /api/legacy/will — active draft + disclaimer status. */
export async function GET() {
  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const [draft, disclaimerAccepted] = await Promise.all([
      getActiveWillDraft(authResult.userId),
      hasAcceptedWillDisclaimer(authResult.userId),
    ]);

    return NextResponse.json({
      disclaimerVersion: WILL_DISCLAIMER_VERSION,
      disclaimerAccepted,
      draft: draft ? serializeWillDraft(draft) : null,
      steps: WILL_STEPS.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
      })),
      visibleStepIds: draft
        ? visibleWillSteps(serializeWillDraft(draft).answers)
        : visibleWillSteps({}),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load will planner");
  }
}

/**
 * POST /api/legacy/will — start a draft (requires prior disclaimer acceptance).
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `will-planner:${userId}`,
    RATE_LIMITS.willPlannerMutate.limit,
    RATE_LIMITS.willPlannerMutate.windowMs,
  );
  if (limited) return limited;

  try {
    const accepted = await hasAcceptedWillDisclaimer(userId);
    if (!accepted) {
      return apiError(
        "Please accept the Will Planner disclaimer before starting.",
        { status: 403, code: "disclaimer_required" },
      );
    }

    const draft = await createWillDraft({
      userId,
      disclaimerVersion: WILL_DISCLAIMER_VERSION,
    });

    return NextResponse.json({ draft: serializeWillDraft(draft) });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to start will planner");
  }
}

/** PATCH /api/legacy/will — save answers after a step. */
export async function PATCH(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `will-planner:${userId}`,
    RATE_LIMITS.willPlannerMutate.limit,
    RATE_LIMITS.willPlannerMutate.windowMs,
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
    return apiError("Invalid will planner update", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const draft = await updateWillDraftAnswers({
      userId,
      draftId: parsed.data.draftId,
      answers: parsed.data.answers as WillAnswers,
      stepId: parsed.data.stepId,
    });
    return NextResponse.json({ draft: serializeWillDraft(draft) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save will draft";
    if (message.includes("not found")) {
      return apiError(message, { status: 404, code: "not_found" });
    }
    return apiErrorFromUnknown(error, "Failed to save will draft");
  }
}
