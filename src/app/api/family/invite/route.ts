import { NextResponse } from "next/server";
import { z } from "zod";
import {
  INVITABLE_FAMILY_ROLES,
  getFamilyForId,
  inviteMember,
} from "@/lib/families";
import {
  familyApiErrorResponse,
  requireFamilyApiOwner,
  requireFamilyApiUser,
} from "@/lib/families/http";
import {
  buildFamilyInviteLink,
  logFamilyInviteLink,
} from "@/lib/families/invite-link";
import { serializeFamilyMember } from "@/lib/families/serialize";
import {
  getUserContact,
  queueFamilyInviteLifecycle,
} from "@/lib/email/lifecycle";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { ensureAppUser } from "@/lib/users";

const inviteBodySchema = z.object({
  familyId: z.string().trim().min(1),
  email: z.string().trim().email().max(320),
  role: z.enum(INVITABLE_FAMILY_ROLES).optional(),
});

/**
 * POST /api/family/invite — create a pending invite (owner only).
 * Sends invitation email; in development the accept link is also logged.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `family-invite:${userId}`,
    RATE_LIMITS.familyInvite.limit,
    RATE_LIMITS.familyInvite.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = inviteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invite request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    await requireFamilyApiOwner(parsed.data.familyId, userId);
    const member = await inviteMember({
      familyId: parsed.data.familyId,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedByUserId: userId,
    });

    if (!member.inviteToken) {
      return NextResponse.json(
        { error: "Invite created without a token." },
        { status: 500 },
      );
    }

    const inviteLink = buildFamilyInviteLink(member.inviteToken);
    const acceptPath = `/family/accept?token=${encodeURIComponent(member.inviteToken)}`;
    logFamilyInviteLink({
      familyId: member.familyId,
      email: member.invitedEmail,
      inviteLink,
      memberId: member.id,
    });

    const [family, inviter] = await Promise.all([
      getFamilyForId(member.familyId),
      getUserContact(userId),
    ]);

    queueFamilyInviteLifecycle({
      inviteeEmail: member.invitedEmail,
      inviteeUserId: member.userId,
      inviterName:
        inviter?.displayName || inviter?.firstName || "A family member",
      familyId: member.familyId,
      familyName: family?.name || "your family",
      role: member.role,
      inviteUrl: inviteLink,
      acceptPath,
    });

    return NextResponse.json(
      {
        member: serializeFamilyMember(member),
        /** Handy for the inviting owner (also emailed to the invitee). */
        inviteLink,
      },
      { status: 201 },
    );
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to send family invite");
  }
}
