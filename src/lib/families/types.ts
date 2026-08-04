/**
 * Family sharing types — kept separate from the Drizzle schema so helpers
 * and UI can import without pulling the full DB module graph.
 */

import type {
  Family,
  FamilyMember,
  FamilyMemberRole,
  FamilyMemberStatus,
  NewFamily,
  NewFamilyMember,
} from "@/lib/db/schema";
import {
  FAMILY_MEMBER_ROLES,
  FAMILY_MEMBER_STATUSES,
} from "@/lib/db/schema";

export {
  FAMILY_MEMBER_ROLES,
  FAMILY_MEMBER_STATUSES,
  type Family,
  type FamilyMember,
  type FamilyMemberRole,
  type FamilyMemberStatus,
  type NewFamily,
  type NewFamilyMember,
};

/** Roles that may be assigned when inviting (owner is created with the family). */
export const INVITABLE_FAMILY_ROLES = ["member", "viewer"] as const;
export type InvitableFamilyRole = (typeof INVITABLE_FAMILY_ROLES)[number];

export type FamilyWithMembership = Family & {
  membership: FamilyMemberSummary;
};

export type FamilyMemberSummary = {
  id: string;
  familyId: string;
  userId: string | null;
  role: FamilyMemberRole;
  status: FamilyMemberStatus;
  invitedEmail: string;
  invitedAt: Date;
  acceptedAt: Date | null;
};

export type CreateFamilyInput = {
  ownerId: string;
  name: string;
};

export type InviteMemberInput = {
  familyId: string;
  /** Clerk user id of the person sending the invite (must be an active owner). */
  invitedByUserId: string;
  email: string;
  role?: InvitableFamilyRole;
};

export type AcceptInviteInput = {
  /** Opaque invite token from the email/link (not family_members.id). */
  tokenOrId: string;
  /** Accepting Clerk user id. */
  userId: string;
};
