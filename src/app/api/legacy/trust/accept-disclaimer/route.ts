import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  recordTrustDisclaimerAcceptance,
  TRUST_DISCLAIMER_VERSION,
} from "@/lib/trust-planner/server";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  agreed: z.boolean().refine((v) => v === true, {
    message: "You must accept the disclaimer to continue.",
  }),
});

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp ? realIp.slice(0, 128) : null;
}

/** POST /api/legacy/trust/accept-disclaimer */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;

  const limited = enforceRateLimit(
    `trust-disclaimer:${authResult.userId}`,
    RATE_LIMITS.termsAccept.limit,
    RATE_LIMITS.termsAccept.windowMs,
  );
  if (limited) return limited;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError("Please accept the Trust Planner disclaimer to continue.", {
      status: 400,
      code: "validation",
    });
  }

  try {
    const row = await recordTrustDisclaimerAcceptance({
      userId: authResult.userId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      disclaimerVersion: TRUST_DISCLAIMER_VERSION,
    });

    return NextResponse.json({
      ok: true,
      acceptedAt: row?.acceptedAt?.toISOString() ?? new Date().toISOString(),
      disclaimerVersion: TRUST_DISCLAIMER_VERSION,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Could not save disclaimer acceptance");
  }
}
