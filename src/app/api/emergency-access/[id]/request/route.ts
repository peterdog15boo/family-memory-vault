import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { requestEmergencyAccess } from "@/lib/emergency-access";
import { serializeEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `emergency-access-request:${userId}`,
    RATE_LIMITS.documentsMutate.limit,
    RATE_LIMITS.documentsMutate.windowMs,
  );
  if (limited) return limited;

  try {
    const row = await requestEmergencyAccess(id, userId);
    return NextResponse.json({
      designation: serializeEmergencyAccessDesignation(row),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to request access");
  }
}
