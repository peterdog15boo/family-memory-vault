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
  sendFamilyInviteLifecycle,
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
 * POST /api/family/invite — create a pending invite and email the recipient
 * (owner only). Re-inviting the same pending email regenerates the token and
 * resends. Success is returned only when the invite email was actually sent.
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
      { error: "Please enter a valid email address.", details: parsed.error.flatten() },
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

    const lifecycle = await sendFamilyInviteLifecycle({
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

    const email = lifecycle.email;
    const delivered = email.ok && !email.logged;
    if (!delivered) {
      const message = email.logged
        ? "Invite email is not configured on the server. Ask an admin to set RESEND_API_KEY, then try again."
        : "Could not send the invite email. Please try again in a moment.";
      console.error("[family.invite] email delivery failed", {
        familyId: member.familyId,
        memberId: member.id,
        inviteeEmail: member.invitedEmail,
        logged: Boolean(email.logged),
        error: email.error,
      });
      return NextResponse.json(
        {
          error: message,
          code: "email_send_failed",
          /** Pending invite exists so the owner can retry (resends). */
          member: serializeFamilyMember(member),
          inviteLink,
          emailSent: false,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        member: serializeFamilyMember(member),
        inviteLink,
        emailSent: true,
      },
      { status: 201 },
    );
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to send family invite");
  }
}
