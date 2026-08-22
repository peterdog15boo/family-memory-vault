/**
 * Family / household sharing helpers.
 *
 * Families group members who can later share memories and media.
 * Media and memories remain owned by their creating user; membership is the
 * access gate for shared surfaces.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  families,
  familyMembers,
  users,
  type Family,
  type FamilyMember,
} from "@/lib/db/schema";
import type {
  AcceptInviteInput,
  CreateFamilyInput,
  FamilyWithMembership,
  InvitableFamilyRole,
  InviteMemberInput,
} from "@/lib/families/types";
import {
  FAMILY_MEMBER_ROLES,
  INVITABLE_FAMILY_ROLES,
  type FamilyMemberRole,
} from "@/lib/families/types";

export type {
  AcceptInviteInput,
  CreateFamilyInput,
  Family,
  FamilyMember,
  FamilyMemberRole,
  FamilyMemberStatus,
  FamilyMemberSummary,
  FamilyWithMembership,
  InvitableFamilyRole,
  InviteMemberInput,
} from "@/lib/families/types";

export {
  FAMILY_MEMBER_ROLES,
  FAMILY_MEMBER_STATUSES,
  INVITABLE_FAMILY_ROLES,
} from "@/lib/families/types";

export class FamilyError extends Error {
  readonly code?: "plan_limit" | "not_found" | "forbidden" | "validation";

  constructor(
    message: string,
    options?: {
      code?: "plan_limit" | "not_found" | "forbidden" | "validation";
    },
  ) {
    super(message);
    this.name = "FamilyError";
    this.code = options?.code;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isInvitableRole(role: string): role is InvitableFamilyRole {
  return (INVITABLE_FAMILY_ROLES as readonly string[]).includes(role);
}

async function getUserEmail(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ? normalizeEmail(row.email) : null;
}

async function getActiveMembership(
  familyId: string,
  userId: string,
): Promise<FamilyMember | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Create a family and seed the creator as the active owner member.
 */
export async function createFamily(
  ownerId: string,
  name: string,
): Promise<Family>;
export async function createFamily(input: CreateFamilyInput): Promise<Family>;
export async function createFamily(
  ownerIdOrInput: string | CreateFamilyInput,
  maybeName?: string,
): Promise<Family> {
  const ownerId =
    typeof ownerIdOrInput === "string"
      ? ownerIdOrInput
      : ownerIdOrInput.ownerId;
  const name =
    typeof ownerIdOrInput === "string"
      ? (maybeName ?? "")
      : ownerIdOrInput.name;

  const trimmed = name.trim();
  if (!trimmed) {
    throw new FamilyError("Family name is required.");
  }
  if (trimmed.length > 120) {
    throw new FamilyError("Family name is too long.");
  }

  const ownerEmail = await getUserEmail(ownerId);
  if (!ownerEmail) {
    throw new FamilyError("Owner user not found.");
  }

  const { canCreateFamily, assertGateAllowed, PlanGateError } = await import(
    "@/lib/plans/gates"
  );
  try {
    assertGateAllowed(await canCreateFamily(ownerId));
  } catch (error) {
    if (error instanceof PlanGateError) {
      throw new FamilyError(
        error.gate.upgradeHint
          ? `${error.message} ${error.gate.upgradeHint}`
          : error.message,
        { code: "plan_limit" },
      );
    }
    throw error;
  }

  const db = getDb();
  const now = new Date();
  const familyId = nanoid();
  const memberId = nanoid();

  const [created] = await db
    .insert(families)
    .values({
      id: familyId,
      name: trimmed,
      createdByUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(familyMembers).values({
    id: memberId,
    familyId,
    userId: ownerId,
    role: "owner",
    status: "active",
    invitedEmail: ownerEmail,
    inviteToken: null,
    invitedByUserId: ownerId,
    invitedAt: now,
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const { upsertChatParticipant } = await import("@/lib/family-chat");
    await upsertChatParticipant({
      familyId,
      userId: ownerId,
      include: true,
    });
  } catch (error) {
    console.error("[family.create] chat participant seed failed", error);
  }

  return created;
}

/**
 * Invite someone to a family by email. Only active owners may invite.
 * Re-invites update an existing pending/declined/removed row for that email.
 *
 * Positional: inviteMember(familyId, email, role, invitedByUserId)
 */
export async function inviteMember(
  familyId: string,
  email: string,
  role: InvitableFamilyRole,
  invitedByUserId: string,
): Promise<FamilyMember>;
export async function inviteMember(
  input: InviteMemberInput,
): Promise<FamilyMember>;
export async function inviteMember(
  familyIdOrInput: string | InviteMemberInput,
  maybeEmail?: string,
  maybeRole?: InvitableFamilyRole,
  maybeInvitedBy?: string,
): Promise<FamilyMember> {
  const input: InviteMemberInput =
    typeof familyIdOrInput === "string"
      ? {
          familyId: familyIdOrInput,
          email: maybeEmail ?? "",
          role: maybeRole,
          invitedByUserId: maybeInvitedBy ?? "",
        }
      : familyIdOrInput;

  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    throw new FamilyError("A valid invite email is required.");
  }
  if (!input.invitedByUserId?.trim()) {
    throw new FamilyError("invitedByUserId is required.");
  }

  const role: InvitableFamilyRole = input.role ?? "member";
  if (!isInvitableRole(role)) {
    throw new FamilyError(
      `Invalid invite role. Use one of: ${INVITABLE_FAMILY_ROLES.join(", ")}.`,
    );
  }

  const membership = await getActiveMembership(
    input.familyId,
    input.invitedByUserId,
  );
  if (!membership || membership.role !== "owner") {
    throw new FamilyError("Only an active family owner can invite members.");
  }

  const db = getDb();
  const [family] = await db
    .select()
    .from(families)
    .where(eq(families.id, input.familyId))
    .limit(1);
  if (!family) {
    throw new FamilyError("Family not found.");
  }

  const inviterEmail = await getUserEmail(input.invitedByUserId);
  if (inviterEmail && inviterEmail === email) {
    throw new FamilyError("You cannot invite yourself.");
  }

  const [existing] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, input.familyId),
        eq(familyMembers.invitedEmail, email),
      ),
    )
    .limit(1);

  if (existing?.status === "active") {
    throw new FamilyError("That person is already an active family member.");
  }

  const reusingSeat = existing?.status === "pending";
  const { canInviteMember, assertGateAllowed, PlanGateError } = await import(
    "@/lib/plans/gates"
  );
  try {
    assertGateAllowed(
      await canInviteMember(input.familyId, {
        reusingSeat,
        billingUserId: family.createdByUserId,
      }),
    );
  } catch (error) {
    if (error instanceof PlanGateError) {
      throw new FamilyError(
        error.gate.upgradeHint
          ? `${error.message} ${error.gate.upgradeHint}`
          : error.message,
        { code: "plan_limit" },
      );
    }
    throw error;
  }

  const now = new Date();
  const inviteToken = nanoid(32);

  // If the invitee already has an account, link for in-app notifications (still pending).
  const [inviteeUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  const inviteeUserId = inviteeUser?.id ?? null;

  if (existing) {
    const [updated] = await db
      .update(familyMembers)
      .set({
        role,
        status: "pending",
        inviteToken,
        invitedByUserId: input.invitedByUserId,
        invitedAt: now,
        acceptedAt: null,
        userId: inviteeUserId,
        updatedAt: now,
      })
      .where(eq(familyMembers.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(familyMembers)
    .values({
      id: nanoid(),
      familyId: input.familyId,
      userId: inviteeUserId,
      role,
      status: "pending",
      invitedEmail: email,
      inviteToken,
      invitedByUserId: input.invitedByUserId,
      invitedAt: now,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

/**
 * Accept a pending invite by invite token only (from the email/link).
 * Links the membership to the accepting user.
 * Matching by family_members.id is intentionally not supported — tokens are
 * the sole public accept credential.
 */
export async function acceptInvite(
  tokenOrId: string,
  userId: string,
): Promise<FamilyMember>;
export async function acceptInvite(
  input: AcceptInviteInput,
): Promise<FamilyMember>;
export async function acceptInvite(
  tokenOrIdOrInput: string | AcceptInviteInput,
  maybeUserId?: string,
): Promise<FamilyMember> {
  const tokenOrId =
    typeof tokenOrIdOrInput === "string"
      ? tokenOrIdOrInput
      : tokenOrIdOrInput.tokenOrId;
  const userId =
    typeof tokenOrIdOrInput === "string"
      ? (maybeUserId ?? "")
      : tokenOrIdOrInput.userId;

  if (!tokenOrId?.trim()) {
    throw new FamilyError("Invite token is required.");
  }
  if (!userId?.trim()) {
    throw new FamilyError("Accepting user id is required.");
  }

  const userEmail = await getUserEmail(userId);
  if (!userEmail) {
    throw new FamilyError("Accepting user not found.");
  }

  const db = getDb();
  const [invite] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.inviteToken, tokenOrId),
        eq(familyMembers.status, "pending"),
      ),
    )
    .limit(1);

  if (!invite) {
    throw new FamilyError("Invite not found or already used.");
  }

  if (normalizeEmail(invite.invitedEmail) !== userEmail) {
    throw new FamilyError(
      "This invite was sent to a different email address.",
    );
  }

  // Prevent joining twice via a second pending invite row.
  const [alreadyActive] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, invite.familyId),
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, "active"),
      ),
    )
    .limit(1);
  if (alreadyActive) {
    throw new FamilyError("You are already an active member of this family.");
  }

  const now = new Date();
  const [updated] = await db
    .update(familyMembers)
    .set({
      userId,
      status: "active",
      acceptedAt: now,
      inviteToken: null,
      updatedAt: now,
    })
    .where(eq(familyMembers.id, invite.id))
    .returning();

  if (!updated) {
    throw new FamilyError("Failed to accept invite.");
  }

  try {
    const { upsertChatParticipant } = await import("@/lib/family-chat");
    await upsertChatParticipant({
      familyId: updated.familyId,
      userId,
      include: true,
    });
  } catch (error) {
    console.error("[family.accept] chat participant seed failed", error);
  }

  return updated;
}

/**
 * Families where the user has an active membership, newest first.
 */
export async function getUserFamilies(
  userId: string,
): Promise<FamilyWithMembership[]> {
  const db = getDb();
  const memberships = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, "active"),
      ),
    )
    .orderBy(desc(familyMembers.acceptedAt), desc(familyMembers.createdAt));

  if (memberships.length === 0) return [];

  const familyIds = memberships.map((m) => m.familyId);
  const familyRows = await db
    .select()
    .from(families)
    .where(inArray(families.id, familyIds));

  const byId = new Map(familyRows.map((f) => [f.id, f]));

  const result: FamilyWithMembership[] = [];
  for (const membership of memberships) {
    const family = byId.get(membership.familyId);
    if (!family) continue;
    result.push({
      ...family,
      membership: {
        id: membership.id,
        familyId: membership.familyId,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        invitedEmail: membership.invitedEmail,
        invitedAt: membership.invitedAt,
        acceptedAt: membership.acceptedAt,
      },
    });
  }
  return result;
}

/**
 * Members of a family (active + pending by default).
 * Pass statuses to filter (e.g. ["active"] only).
 */
export async function getFamilyMembers(
  familyId: string,
  options?: {
    statuses?: Array<"pending" | "active" | "declined" | "removed">;
  },
): Promise<FamilyMember[]> {
  const db = getDb();
  const [family] = await db
    .select({ id: families.id })
    .from(families)
    .where(eq(families.id, familyId))
    .limit(1);
  if (!family) {
    throw new FamilyError("Family not found.");
  }

  const statuses = options?.statuses ?? ["pending", "active"];
  return db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        inArray(familyMembers.status, statuses),
      ),
    )
    .orderBy(desc(familyMembers.createdAt));
}

/** Load a family by id (or null). */
export async function getFamilyForId(
  familyId: string,
): Promise<Family | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(families)
    .where(eq(families.id, familyId))
    .limit(1);
  return row ?? null;
}

/**
 * Active membership for a user in a family, or null if none.
 */
export async function getActiveFamilyMembership(
  familyId: string,
  userId: string,
): Promise<FamilyMember | null> {
  return getActiveMembership(familyId, userId);
}

/**
 * Require the user to be an active member of the family.
 * Throws FamilyError when missing.
 */
export async function requireActiveFamilyMember(
  familyId: string,
  userId: string,
): Promise<FamilyMember> {
  const membership = await getActiveMembership(familyId, userId);
  if (!membership) {
    throw new FamilyError("You are not an active member of this family.");
  }
  return membership;
}

export function isFamilyMemberRole(
  value: string,
): value is (typeof FAMILY_MEMBER_ROLES)[number] {
  return (FAMILY_MEMBER_ROLES as readonly string[]).includes(value);
}

async function countActiveOwners(familyId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.status, "active"),
        eq(familyMembers.role, "owner"),
      ),
    );
  return rows.length;
}

/**
 * Change a member's role. Only active owners may do this.
 * Cannot demote the last remaining owner.
 */
export async function updateMemberRole(
  familyId: string,
  memberId: string,
  role: FamilyMemberRole,
  actorUserId: string,
): Promise<FamilyMember> {
  if (!isFamilyMemberRole(role)) {
    throw new FamilyError(
      `Invalid role. Use one of: ${FAMILY_MEMBER_ROLES.join(", ")}.`,
    );
  }

  const actor = await getActiveMembership(familyId, actorUserId);
  if (!actor || actor.role !== "owner") {
    throw new FamilyError("Only an active family owner can change roles.");
  }

  const db = getDb();
  const [target] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, memberId),
        eq(familyMembers.familyId, familyId),
      ),
    )
    .limit(1);

  if (!target) {
    throw new FamilyError("Family member not found.");
  }
  if (target.status !== "active" && target.status !== "pending") {
    throw new FamilyError("Only active or pending members can change roles.");
  }
  if (target.role === role) {
    return target;
  }

  if (target.status === "pending" && role === "owner") {
    throw new FamilyError("Pending invites cannot be owners. Invite as member or viewer.");
  }

  if (
    target.status === "active" &&
    target.role === "owner" &&
    role !== "owner"
  ) {
    const owners = await countActiveOwners(familyId);
    if (owners <= 1) {
      throw new FamilyError(
        "Cannot demote the only owner. Promote another member first.",
      );
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(familyMembers)
    .set({ role, updatedAt: now })
    .where(eq(familyMembers.id, target.id))
    .returning();

  if (!updated) {
    throw new FamilyError("Failed to update member role.");
  }
  return updated;
}

/**
 * Remove a member or cancel a pending invite. Owner-only.
 * Cannot remove the only active owner.
 */
export async function removeMember(
  familyId: string,
  memberId: string,
  actorUserId: string,
): Promise<FamilyMember> {
  const actor = await getActiveMembership(familyId, actorUserId);
  if (!actor || actor.role !== "owner") {
    throw new FamilyError("Only an active family owner can remove members.");
  }

  const db = getDb();
  const [target] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, memberId),
        eq(familyMembers.familyId, familyId),
      ),
    )
    .limit(1);

  if (!target) {
    throw new FamilyError("Family member not found.");
  }
  if (target.status === "removed") {
    return target;
  }

  if (target.userId === actorUserId) {
    throw new FamilyError(
      "Owners cannot remove themselves. Transfer ownership or use leave as a non-owner.",
    );
  }

  if (target.status === "active" && target.role === "owner") {
    const owners = await countActiveOwners(familyId);
    if (owners <= 1) {
      throw new FamilyError("Cannot remove the only owner.");
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(familyMembers)
    .set({
      status: "removed",
      inviteToken: null,
      updatedAt: now,
    })
    .where(eq(familyMembers.id, target.id))
    .returning();

  if (!updated) {
    throw new FamilyError("Failed to remove member.");
  }

  if (updated.userId) {
    try {
      const { excludeChatParticipant } = await import("@/lib/family-chat");
      await excludeChatParticipant({
        familyId,
        userId: updated.userId,
      });
    } catch (error) {
      console.error("[family.remove] chat exclude failed", error);
    }
  }

  return updated;
}

/**
 * Leave a family. Non-owners only (owners must transfer ownership first).
 */
export async function leaveFamily(
  familyId: string,
  userId: string,
): Promise<FamilyMember> {
  const membership = await getActiveMembership(familyId, userId);
  if (!membership) {
    throw new FamilyError("You are not an active member of this family.");
  }
  if (membership.role === "owner") {
    throw new FamilyError(
      "Owners cannot leave. Promote another member to owner first, or remove other members and keep the family.",
    );
  }

  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(familyMembers)
    .set({
      status: "removed",
      inviteToken: null,
      updatedAt: now,
    })
    .where(eq(familyMembers.id, membership.id))
    .returning();

  if (!updated) {
    throw new FamilyError("Failed to leave family.");
  }

  try {
    const { excludeChatParticipant } = await import("@/lib/family-chat");
    await excludeChatParticipant({ familyId, userId });
  } catch (error) {
    console.error("[family.leave] chat exclude failed", error);
  }

  return updated;
}

export type FamilyMemberWithProfile = FamilyMember & {
  displayName: string | null;
  imageUrl: string | null;
};

/**
 * Members with optional user profile fields for the settings UI.
 */
export async function getFamilyMembersWithProfiles(
  familyId: string,
  options?: {
    statuses?: Array<"pending" | "active" | "declined" | "removed">;
  },
): Promise<FamilyMemberWithProfile[]> {
  const members = await getFamilyMembers(familyId, options);
  if (members.length === 0) return [];

  const userIds = members
    .map((m) => m.userId)
    .filter((id): id is string => Boolean(id));

  const db = getDb();
  const profiles =
    userIds.length > 0
      ? await db
          .select({
            id: users.id,
            displayName: users.displayName,
            imageUrl: users.imageUrl,
          })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];

  const byId = new Map(profiles.map((p) => [p.id, p]));

  return members.map((member) => {
    const profile = member.userId ? byId.get(member.userId) : undefined;
    return {
      ...member,
      displayName: profile?.displayName ?? null,
      imageUrl: profile?.imageUrl ?? null,
    };
  });
}
