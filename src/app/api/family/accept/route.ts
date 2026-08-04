import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptInvite } from "@/lib/families";
import {
  familyApiErrorResponse,
  requireFamilyApiUser,
} from "@/lib/families/http";
import { serializeFamilyMember } from "@/lib/families/serialize";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { ensureAppUser } from "@/lib/users";

const acceptBodySchema = z.object({
  /** Opaque invite token from the email/link only (not member id). */
  token: z.string().trim().min(8),
});

/**
 * POST /api/family/accept — accept a pending invite for the signed-in user.
 * Requires the invite token; email on the account must match the invite.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `family-accept:${userId}`,
    RATE_LIMITS.familyAccept.limit,
    RATE_LIMITS.familyAccept.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = acceptBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid accept request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    const member = await acceptInvite(parsed.data.token, userId);
    return NextResponse.json({ member: serializeFamilyMember(member) });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to accept family invite");
  }
}
