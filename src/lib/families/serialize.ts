import type {
  Family,
  FamilyMember,
  FamilyWithMembership,
} from "@/lib/families/types";

export type SerializedFamily = {
  id: string;
  name: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedFamilyMember = {
  id: string;
  familyId: string;
  userId: string | null;
  role: FamilyMember["role"];
  status: FamilyMember["status"];
  invitedEmail: string;
  invitedByUserId: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  firstContributedAt: string | null;
  createdAt: string;
  updatedAt: string;
  displayName?: string | null;
  imageUrl?: string | null;
};

export type SerializedFamilyWithMembership = SerializedFamily & {
  membership: {
    id: string;
    familyId: string;
    userId: string | null;
    role: FamilyMember["role"];
    status: FamilyMember["status"];
    invitedEmail: string;
    invitedAt: string;
    acceptedAt: string | null;
  };
};

export function serializeFamily(family: Family): SerializedFamily {
  return {
    id: family.id,
    name: family.name,
    createdByUserId: family.createdByUserId,
    createdAt: family.createdAt.toISOString(),
    updatedAt: family.updatedAt.toISOString(),
  };
}

export function serializeFamilyMember(
  member: FamilyMember & {
    displayName?: string | null;
    imageUrl?: string | null;
  },
): SerializedFamilyMember {
  return {
    id: member.id,
    familyId: member.familyId,
    userId: member.userId,
    role: member.role,
    status: member.status,
    invitedEmail: member.invitedEmail,
    invitedByUserId: member.invitedByUserId,
    invitedAt: member.invitedAt.toISOString(),
    acceptedAt: member.acceptedAt?.toISOString() ?? null,
    firstContributedAt: member.firstContributedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    displayName: member.displayName ?? null,
    imageUrl: member.imageUrl ?? null,
  };
}

/**
 * Serialize a member for a specific viewer.
 * Non-owners see redacted emails on pending invites (privacy).
 */
export function serializeFamilyMemberForViewer(
  member: FamilyMember & {
    displayName?: string | null;
    imageUrl?: string | null;
  },
  options: { viewerIsOwner: boolean },
): SerializedFamilyMember {
  const base = serializeFamilyMember(member);
  if (options.viewerIsOwner || member.status !== "pending") {
    return base;
  }

  const email = member.invitedEmail;
  const at = email.lastIndexOf("@");
  const redacted =
    at > 0
      ? `${email.slice(0, 1)}…@${email.slice(at + 1)}`
      : "Pending invite";

  return {
    ...base,
    invitedEmail: redacted,
    displayName: null,
  };
}

export function serializeFamilyWithMembership(
  row: FamilyWithMembership,
): SerializedFamilyWithMembership {
  return {
    ...serializeFamily(row),
    membership: {
      id: row.membership.id,
      familyId: row.membership.familyId,
      userId: row.membership.userId,
      role: row.membership.role,
      status: row.membership.status,
      invitedEmail: row.membership.invitedEmail,
      invitedAt: row.membership.invitedAt.toISOString(),
      acceptedAt: row.membership.acceptedAt?.toISOString() ?? null,
    },
  };
}
