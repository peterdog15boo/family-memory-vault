import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { denyEmergencyAccess } from "@/lib/emergency-access";
import { serializeEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().max(1000).optional().nullable(),
});

export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `emergency-access-deny:${userId}`,
    RATE_LIMITS.documentsMutate.limit,
    RATE_LIMITS.documentsMutate.windowMs,
  );
  if (limited) return limited;

  let reason: string | null | undefined;
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    reason = parsed.success ? parsed.data.reason : undefined;
  } catch {
    reason = undefined;
  }

  try {
    const row = await denyEmergencyAccess(id, userId, reason);
    return NextResponse.json({
      designation: serializeEmergencyAccessDesignation(row),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to deny access");
  }
}
