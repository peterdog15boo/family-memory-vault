import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  createEmergencyDesignation,
  listOwnerEmergencyDesignations,
} from "@/lib/emergency-access";
import { serializeEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

const createSchema = z.object({
  designateeEmail: z.string().email().max(320),
  designateeName: z.string().min(1).max(200),
  relationship: z.string().max(200).optional().nullable(),
  waitingPeriodHours: z.number().int().min(0).max(720).optional(),
  accessType: z.enum(["temporary", "permanent"]).optional(),
  grantDurationDays: z.number().int().min(1).max(365).optional(),
  ownerNotes: z.string().max(4000).optional().nullable(),
});

export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  try {
    await ensureAppUser(userId);
    const rows = await listOwnerEmergencyDesignations(userId);
    return NextResponse.json({
      designations: rows.map((row) => serializeEmergencyAccessDesignation(row)),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load emergency access");
  }
}

export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `emergency-access:${userId}`,
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid designation", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    await ensureAppUser(userId);
    const row = await createEmergencyDesignation({
      ownerUserId: userId,
      ...parsed.data,
    });
    return NextResponse.json({
      designation: serializeEmergencyAccessDesignation(row),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to create designation");
  }
}
