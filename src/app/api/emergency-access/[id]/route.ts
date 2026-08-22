import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import {
  deleteEmergencyDesignation,
  updateEmergencyDesignation,
} from "@/lib/emergency-access";
import { serializeEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  designateeEmail: z.string().email().max(320).optional(),
  designateeName: z.string().min(1).max(200).optional(),
  relationship: z.string().max(200).optional().nullable(),
  waitingPeriodHours: z.number().int().min(0).max(720).optional(),
  accessType: z.enum(["temporary", "permanent"]).optional(),
  grantDurationDays: z.number().int().min(1).max(365).optional(),
  ownerNotes: z.string().max(4000).optional().nullable(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `emergency-access-patch:${userId}`,
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid update", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const row = await updateEmergencyDesignation(id, userId, parsed.data);
    return NextResponse.json({
      designation: serializeEmergencyAccessDesignation(row),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update designation");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  try {
    await deleteEmergencyDesignation(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to delete designation");
  }
}
