import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { afterLegacyPlanningChanged } from "@/lib/gamification/legacy-ready";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  LEGACY_PLANNING_CATEGORY_IDS,
  LEGACY_PLANNING_SENSITIVITIES,
} from "@/lib/legacy/planning-categories";
import {
  deletePlanningItem,
  loadPlanningScore,
  serializePlanningBoard,
  serializePlanningItem,
  updatePlanningItem,
  verifyPlanningItem,
} from "@/lib/legacy/planning";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  categoryId: z.enum(LEGACY_PLANNING_CATEGORY_IDS).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  institution: z.string().trim().max(200).optional().nullable(),
  accountHint: z.string().trim().max(32).optional().nullable(),
  locationHint: z.string().trim().max(500).optional().nullable(),
  contactName: z.string().trim().max(200).optional().nullable(),
  contactPhone: z.string().trim().max(40).optional().nullable(),
  contactEmail: z
    .string()
    .trim()
    .email()
    .max(320)
    .optional()
    .nullable()
    .or(z.literal("")),
  notes: z.string().trim().max(20000).optional().nullable(),
  sensitivity: z.enum(LEGACY_PLANNING_SENSITIVITIES).optional(),
  documentIds: z.array(z.string().min(1).max(64)).max(12).optional(),
  verify: z.boolean().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `legacy-planning:${userId}`,
    RATE_LIMITS.documentsMutate.limit,
    RATE_LIMITS.documentsMutate.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid planning item", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const item = parsed.data.verify
      ? await verifyPlanningItem(id, userId)
      : await updatePlanningItem(id, userId, {
          ...parsed.data,
          contactEmail:
            parsed.data.contactEmail === ""
              ? null
              : parsed.data.contactEmail,
        });
    const celebration = await afterLegacyPlanningChanged({
      userId,
      categoryId: item.categoryId,
    });
    const { score, items } = await loadPlanningScore(userId);
    return NextResponse.json({
      item: serializePlanningItem(item),
      board: serializePlanningBoard(score, items),
      celebration,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update planning item");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `legacy-planning:${userId}`,
    RATE_LIMITS.documentsMutate.limit,
    RATE_LIMITS.documentsMutate.windowMs,
  );
  if (limited) return limited;

  try {
    await deletePlanningItem(id, userId);
    const celebration = await afterLegacyPlanningChanged({ userId });
    const { score, items } = await loadPlanningScore(userId);
    return NextResponse.json({
      ok: true,
      board: serializePlanningBoard(score, items),
      celebration,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to delete planning item");
  }
}
