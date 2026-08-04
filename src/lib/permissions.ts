/**
 * Permission layer for Family Memory Vault.
 *
 * Ownership + family roles gate access. Media served through these helpers
 * is always moderation_status=clean and status=ready — never quarantined,
 * pending, adult, or rejected.
 *
 * Role capabilities (active membership required):
 * - owner:  view, contribute, manage members, delete family
 * - member: view, contribute
 * - viewer: view only
 *
 * Memories are private by default. Family members only see a memory when the
 * owner enables `sharedWithFamily`. Optional `familyAccess`:
 * - view: read-only for the family
 * - contribute: family members/owners may edit (viewers stay read-only)
 *
 * Media galleries still use co-member ownership for clean media listing.
 */

import { and, eq, inArray, isNotNull, SQL } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/lib/db";
import {
  familyMembers,
  media,
  memories,
  people,
  type FamilyMemberRole,
  type Media,
} from "@/lib/db/schema";
import { isSafeToServe } from "@/lib/moderation/types";

/* -------------------------------------------------------------------------- */
/* Role capability matrix                                                     */
/* -------------------------------------------------------------------------- */

export type FamilyCapability =
  | "view"
  | "contribute"
  | "manageMembers"
  | "deleteFamily";

const ROLE_CAPABILITIES: Record<
  FamilyMemberRole,
  ReadonlySet<FamilyCapability>
> = {
  owner: new Set(["view", "contribute", "manageMembers", "deleteFamily"]),
  member: new Set(["view", "contribute"]),
  viewer: new Set(["view"]),
};

const ROLE_RANK: Record<FamilyMemberRole, number> = {
  viewer: 1,
  member: 2,
  owner: 3,
};

export function roleHasCapability(
  role: FamilyMemberRole,
  capability: FamilyCapability,
): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

function higherRole(
  a: FamilyMemberRole,
  b: FamilyMemberRole,
): FamilyMemberRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

/* -------------------------------------------------------------------------- */
/* Family membership                                                          */
/* -------------------------------------------------------------------------- */

/**
 * True when the user has an active membership in the family.
 */
export async function isFamilyMember(
  userId: string,
  familyId: string,
): Promise<boolean> {
  const role = await getFamilyRole(userId, familyId);
  return role !== null;
}

/**
 * Active role for the user in the family, or null if not an active member.
 */
export async function getFamilyRole(
  userId: string,
  familyId: string,
): Promise<FamilyMemberRole | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: familyMembers.role })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, "active"),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

export async function canManageFamilyMembers(
  userId: string,
  familyId: string,
): Promise<boolean> {
  const role = await getFamilyRole(userId, familyId);
  return role !== null && roleHasCapability(role, "manageMembers");
}

export async function canDeleteFamily(
  userId: string,
  familyId: string,
): Promise<boolean> {
  const role = await getFamilyRole(userId, familyId);
  return role !== null && roleHasCapability(role, "deleteFamily");
}

export async function canContributeToFamily(
  userId: string,
  familyId: string,
): Promise<boolean> {
  const role = await getFamilyRole(userId, familyId);
  return role !== null && roleHasCapability(role, "contribute");
}

/* -------------------------------------------------------------------------- */
/* Shared-family access between two users                                     */
/* -------------------------------------------------------------------------- */

/**
 * Best (highest) active role the viewer holds in any family shared with
 * `ownerUserId`. Null when they share no active family.
 */
export async function getSharedFamilyRole(
  viewerUserId: string,
  ownerUserId: string,
): Promise<FamilyMemberRole | null> {
  if (viewerUserId === ownerUserId) {
    return "owner";
  }

  const db = getDb();

  const viewerFamilies = await db
    .select({ familyId: familyMembers.familyId, role: familyMembers.role })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.userId, viewerUserId),
        eq(familyMembers.status, "active"),
      ),
    );

  if (viewerFamilies.length === 0) return null;

  const familyIds = viewerFamilies.map((row) => row.familyId);
  const ownerMemberships = await db
    .select({ familyId: familyMembers.familyId })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.userId, ownerUserId),
        eq(familyMembers.status, "active"),
        inArray(familyMembers.familyId, familyIds),
      ),
    );

  if (ownerMemberships.length === 0) return null;

  const sharedFamilyIds = new Set(
    ownerMemberships.map((row) => row.familyId),
  );
  let best: FamilyMemberRole | null = null;
  for (const row of viewerFamilies) {
    if (!sharedFamilyIds.has(row.familyId)) continue;
    best = best ? higherRole(best, row.role) : row.role;
  }
  return best;
}

async function canViewOwnedBy(
  viewerUserId: string,
  ownerUserId: string,
): Promise<boolean> {
  if (viewerUserId === ownerUserId) return true;
  const role = await getSharedFamilyRole(viewerUserId, ownerUserId);
  return role !== null && roleHasCapability(role, "view");
}

async function canContributeOwnedBy(
  actorUserId: string,
  ownerUserId: string,
): Promise<boolean> {
  if (actorUserId === ownerUserId) return true;
  const role = await getSharedFamilyRole(actorUserId, ownerUserId);
  return role !== null && roleHasCapability(role, "contribute");
}

/**
 * User ids whose content this user may see via ownership or family membership.
 * Always includes `userId`. Deduped per request via React `cache()`.
 */
export const getAccessibleOwnerIds = cache(
  async (userId: string): Promise<string[]> => {
    const db = getDb();

    const myFamilies = await db
      .select({ familyId: familyMembers.familyId })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.userId, userId),
          eq(familyMembers.status, "active"),
        ),
      );

    if (myFamilies.length === 0) return [userId];

    const familyIds = myFamilies.map((row) => row.familyId);
    const coMembers = await db
      .select({ userId: familyMembers.userId })
      .from(familyMembers)
      .where(
        and(
          inArray(familyMembers.familyId, familyIds),
          eq(familyMembers.status, "active"),
          isNotNull(familyMembers.userId),
        ),
      );

    const ids = new Set<string>([userId]);
    for (const row of coMembers) {
      if (row.userId) ids.add(row.userId);
    }
    return [...ids];
  },
);

/* -------------------------------------------------------------------------- */
/* Media safety                                                               */
/* -------------------------------------------------------------------------- */

function isCleanReadyMedia(
  row: Pick<Media, "moderationStatus" | "status">,
): boolean {
  return isSafeToServe(row.moderationStatus) && row.status === "ready";
}

/**
 * SQL fragment for family-safe media listings:
 * clean + ready, owned by the user or an active family co-member.
 */
export async function getAccessibleMediaFilter(
  userId: string,
): Promise<SQL> {
  const ownerIds = await getAccessibleOwnerIds(userId);
  return and(
    eq(media.moderationStatus, "clean"),
    eq(media.status, "ready"),
    inArray(media.userId, ownerIds),
  )!;
}

/* -------------------------------------------------------------------------- */
/* Resource checks                                                            */
/* -------------------------------------------------------------------------- */

/**
 * View a media item. Own or family (view role). Always requires clean + ready.
 * Quarantined / pending / adult / rejected media are never allowed.
 */
export async function canViewMedia(
  userId: string,
  mediaId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({
      userId: media.userId,
      moderationStatus: media.moderationStatus,
      status: media.status,
    })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) return false;
  if (!isCleanReadyMedia(row)) return false;
  return canViewOwnedBy(userId, row.userId);
}

/**
 * Edit a memory (title, description, media links, settings, sharing).
 * Allowed for the memory owner, or when the memory is shared with
 * familyAccess=contribute and the actor has a contribute family role.
 */
export async function canEditMemory(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({
      userId: memories.userId,
      sharedWithFamily: memories.sharedWithFamily,
      familyAccess: memories.familyAccess,
    })
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);

  if (!row) return false;
  if (row.userId === userId) return true;
  if (!row.sharedWithFamily || row.familyAccess !== "contribute") return false;
  return canContributeOwnedBy(userId, row.userId);
}

/**
 * View a person identity — owner-only for now.
 * People/faces are not shared via family membership; do not use family
 * co-membership here until an explicit people-sharing model exists.
 */
export async function canViewPerson(
  userId: string,
  personId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ userId: people.userId })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);

  if (!row) return false;
  return row.userId === userId;
}

/**
 * View a memory. Own always; family only when sharedWithFamily is enabled.
 * Linked media must still pass clean/ready filters when rendered.
 */
export async function canViewMemory(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({
      userId: memories.userId,
      sharedWithFamily: memories.sharedWithFamily,
    })
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);

  if (!row) return false;
  if (row.userId === userId) return true;
  if (!row.sharedWithFamily) return false;
  return canViewOwnedBy(userId, row.userId);
}

/**
 * Owner-only: change family sharing settings on a memory.
 */
export async function canManageMemorySharing(
  userId: string,
  memoryId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ userId: memories.userId })
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);
  return Boolean(row && row.userId === userId);
}
