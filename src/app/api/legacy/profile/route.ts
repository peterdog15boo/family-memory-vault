import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { upsertLegacyProfile } from "@/lib/legacy";
import { serializeLegacyProfile } from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

const patchSchema = z.object({
  summaryMessage: z.string().max(20000).optional().nullable(),
  funeralPreferences: z.string().max(20000).optional().nullable(),
  generalInstructions: z.string().max(20000).optional().nullable(),
});

/**
 * PATCH /api/legacy/profile
 */
export async function PATCH(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-profile:${userId}`,
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
    const row = await upsertLegacyProfile({
      userId,
      ...parsed.data,
    });
    return NextResponse.json({ profile: serializeLegacyProfile(row) });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to save profile");
  }
}
