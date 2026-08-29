/**
 * Family Tree ACL — one tree per familyId; creator owns it.
 *
 * shareWithMembers (treeSharedWithFamily): members may view the same tree.
 * membersCanEdit (membersCanEditTree): members may persist edits (only if share is on).
 * Invite ≠ tree share — the creator must flip share on.
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { families, familyMembers, familyTrees } from "@/lib/db/schema";
import { canUseFamilyTree } from "@/lib/plans/gates";
import type { FamilyTreeScope } from "@/lib/family-tree/scope";

export type FamilyTreeFamilyOption = {
  familyId: string;
  familyName: string;
  peopleOwnerId: string;
  hasTree: boolean;
  /** Creator always; members only when shareWithMembers is on. */
  canView: boolean;
  /** Creator always; members when share + membersCanEdit. */
  canEdit: boolean;
  isFamilyCreator: boolean;
  /** @deprecated Prefer shareWithMembers — kept for API compatibility. */
  treeSharedWithFamily: boolean;
  shareWithMembers: boolean;
  membersCanEdit: boolean;
  role: string;
};

export type FamilyTreeAccessContext = {
  viewerUserId: string;
  familyId: string;
  familyName: string;
  /** Vault user whose People records may be linked (family creator). */
  peopleOwnerId: string;
  /** @deprecated Use peopleOwnerId — kept for API compatibility during transition. */
  treeOwnerId: string;
  canView: boolean;
  canEdit: boolean;
  /** True when viewer created the family (manages share toggles). */
  isOwner: boolean;
  /** @deprecated Prefer shareWithMembers. */
  treeSharedWithFamily: boolean;
  shareWithMembers: boolean;
  membersCanEdit: boolean;
  hasTree: boolean;
  /**
   * Families the viewer belongs to (for the picker) — includes unshared
   * trees so members can see “not shared yet.”
   */
  families: FamilyTreeFamilyOption[];
};

type MembershipRow = {
  familyId: string;
  familyName: string;
  peopleOwnerId: string;
  treeSharedWithFamily: boolean;
  membersCanEditTree: boolean;
  role: string;
  hasTree: boolean;
};

async function listFamilyTreeMemberships(
  viewerUserId: string,
): Promise<MembershipRow[]> {
  const db = getDb();
  try {
    const rows = await db
      .select({
        familyId: families.id,
        familyName: families.name,
        peopleOwnerId: families.createdByUserId,
        treeSharedWithFamily: families.treeSharedWithFamily,
        membersCanEditTree: families.membersCanEditTree,
        role: familyMembers.role,
        treeFamilyId: familyTrees.familyId,
      })
      .from(familyMembers)
      .innerJoin(families, eq(families.id, familyMembers.familyId))
      .leftJoin(familyTrees, eq(familyTrees.familyId, families.id))
      .where(
        and(
          eq(familyMembers.userId, viewerUserId),
          eq(familyMembers.status, "active"),
        ),
      )
      .orderBy(asc(families.createdAt));

    return rows.map((r) => ({
      familyId: r.familyId,
      familyName: r.familyName,
      peopleOwnerId: r.peopleOwnerId,
      treeSharedWithFamily: r.treeSharedWithFamily,
      membersCanEditTree: Boolean(r.membersCanEditTree),
      role: r.role,
      hasTree: Boolean(r.treeFamilyId),
    }));
  } catch (error) {
    console.warn(
      "[family-tree.access] listFamilyTreeMemberships failed; falling back",
      error,
    );
    const rows = await db
      .select({
        familyId: families.id,
        familyName: families.name,
        peopleOwnerId: families.createdByUserId,
        treeSharedWithFamily: families.treeSharedWithFamily,
        role: familyMembers.role,
      })
      .from(familyMembers)
      .innerJoin(families, eq(families.id, familyMembers.familyId))
      .where(
        and(
          eq(familyMembers.userId, viewerUserId),
          eq(familyMembers.status, "active"),
        ),
      )
      .orderBy(asc(families.createdAt));

    return rows.map((r) => ({
      familyId: r.familyId,
      familyName: r.familyName,
      peopleOwnerId: r.peopleOwnerId,
      treeSharedWithFamily: r.treeSharedWithFamily,
      membersCanEditTree: false,
      role: r.role,
      hasTree: false,
    }));
  }
}

/** Pure ACL for one membership row — exported for tests. */
export function familyTreeAccessFromMembership(
  m: {
    familyId: string;
    familyName: string;
    peopleOwnerId: string;
    treeSharedWithFamily: boolean;
    membersCanEditTree?: boolean;
    /** @deprecated Ignored — family-level share is the source of truth. */
    canViewTree?: boolean;
    /** @deprecated Ignored — use membersCanEditTree. */
    canContributeTree?: boolean;
    role: string;
    hasTree: boolean;
  },
  viewerUserId: string,
): FamilyTreeFamilyOption {
  const isFamilyCreator = m.peopleOwnerId === viewerUserId;
  const shareWithMembers = Boolean(m.treeSharedWithFamily);
  const membersCanEdit = Boolean(m.membersCanEditTree);
  // Creator always; members when the creator shares the tree with the family.
  const canView = isFamilyCreator || shareWithMembers;
  // Creator always; members only when share AND membersCanEdit are on.
  const canEdit =
    isFamilyCreator ||
    (shareWithMembers &&
      membersCanEdit &&
      (m.role === "owner" || m.role === "member"));

  return {
    familyId: m.familyId,
    familyName: m.familyName,
    peopleOwnerId: m.peopleOwnerId,
    hasTree: m.hasTree,
    canView,
    canEdit,
    isFamilyCreator,
    treeSharedWithFamily: shareWithMembers,
    shareWithMembers,
    membersCanEdit,
    role: m.role,
  };
}

function optionFromMembership(
  m: MembershipRow,
  viewerUserId: string,
): FamilyTreeFamilyOption {
  return familyTreeAccessFromMembership(m, viewerUserId);
}

/**
 * Families the viewer belongs to (picker). Includes unshared trees.
 */
export async function listFamilyTreeOptions(
  viewerUserId: string,
): Promise<FamilyTreeFamilyOption[]> {
  const memberships = await listFamilyTreeMemberships(viewerUserId);
  return memberships.map((m) => optionFromMembership(m, viewerUserId));
}

/**
 * Resolve which family tree the viewer should open.
 * Prefer `preferredFamilyId` when the viewer is a member (even if share is off).
 */
export async function resolveFamilyTreeAccess(
  viewerUserId: string,
  preferredFamilyId?: string | null,
): Promise<FamilyTreeAccessContext | null> {
  const options = await listFamilyTreeOptions(viewerUserId);
  if (options.length === 0) return null;

  const preferred =
    preferredFamilyId &&
    options.find((o) => o.familyId === preferredFamilyId);

  // Explicit familyId that the viewer is not a member of → deny.
  if (preferredFamilyId && !preferred) {
    return null;
  }

  const gate = await canUseFamilyTree(viewerUserId).catch(() => ({
    allowed: false as const,
  }));
  const ownedWithPlan = gate.allowed
    ? options.find((o) => o.isFamilyCreator)
    : undefined;

  // Prefer a viewable tree when no explicit familyId; else first membership.
  const active =
    preferred ||
    ownedWithPlan ||
    options.find((o) => o.canView) ||
    options[0]!;

  return {
    viewerUserId,
    familyId: active.familyId,
    familyName: active.familyName,
    peopleOwnerId: active.peopleOwnerId,
    treeOwnerId: active.peopleOwnerId,
    canView: active.canView,
    canEdit: active.canEdit,
    isOwner: active.isFamilyCreator,
    treeSharedWithFamily: active.shareWithMembers,
    shareWithMembers: active.shareWithMembers,
    membersCanEdit: active.membersCanEdit,
    hasTree: active.hasTree,
    families: options,
  };
}

export async function canAccessFamilyTreeNav(
  viewerUserId: string,
): Promise<boolean> {
  const options = await listFamilyTreeOptions(viewerUserId);
  if (options.length > 0) return true;
  const gate = await canUseFamilyTree(viewerUserId).catch(() => ({
    allowed: false as const,
  }));
  return gate.allowed;
}

/**
 * View a family's tree — creator always; members when shareWithMembers is on.
 */
export async function canViewFamilyTree(
  viewerUserId: string,
  familyId: string,
): Promise<boolean> {
  const options = await listFamilyTreeOptions(viewerUserId);
  return options.some((o) => o.familyId === familyId && o.canView);
}

/**
 * Edit a family's tree — creator always; members need share + membersCanEdit.
 */
export async function canEditFamilyTree(
  viewerUserId: string,
  familyId: string,
): Promise<boolean> {
  const options = await listFamilyTreeOptions(viewerUserId);
  return options.some((o) => o.familyId === familyId && o.canEdit);
}

/** @deprecated Prefer canViewFamilyTree(viewer, familyId). */
export async function canViewFamilyTreeByOwner(
  viewerUserId: string,
  treeOwnerId: string,
): Promise<boolean> {
  if (viewerUserId === treeOwnerId) return true;
  const options = await listFamilyTreeOptions(viewerUserId);
  return options.some(
    (o) => o.peopleOwnerId === treeOwnerId && o.canView,
  );
}

/** @deprecated Prefer canEditFamilyTree(viewer, familyId). */
export async function canEditFamilyTreeByOwner(
  viewerUserId: string,
  treeOwnerId: string,
): Promise<boolean> {
  if (viewerUserId === treeOwnerId) return true;
  const options = await listFamilyTreeOptions(viewerUserId);
  return options.some(
    (o) => o.peopleOwnerId === treeOwnerId && o.canEdit,
  );
}

export function scopeFromAccess(
  access: FamilyTreeAccessContext,
): FamilyTreeScope {
  return {
    familyId: access.familyId,
    peopleOwnerId: access.peopleOwnerId,
  };
}

/**
 * Ensure a family_trees row exists (idempotent).
 * Does NOT turn share on — invite ≠ tree share.
 */
export async function ensureFamilyTree(input: {
  familyId: string;
  createdByUserId: string;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(familyTrees)
    .values({
      familyId: input.familyId,
      createdByUserId: input.createdByUserId,
    })
    .onConflictDoNothing({ target: familyTrees.familyId });
}

/**
 * Owner toggles for Family Tree sharing.
 * Turning share off also clears membersCanEdit.
 */
export async function setFamilyTreeSharing(input: {
  familyId: string;
  shared: boolean;
  membersCanEdit?: boolean;
}): Promise<void> {
  const db = getDb();
  const membersCanEdit = input.shared
    ? (input.membersCanEdit ?? undefined)
    : false;

  await db
    .update(families)
    .set({
      treeSharedWithFamily: input.shared,
      ...(membersCanEdit !== undefined
        ? { membersCanEditTree: membersCanEdit }
        : {}),
      // Share off forces edit off.
      ...(!input.shared ? { membersCanEditTree: false } : {}),
      updatedAt: new Date(),
    })
    .where(eq(families.id, input.familyId));
}

/**
 * @deprecated Per-member ACL is no longer the source of truth.
 * Family-level shareWithMembers / membersCanEdit replace these flags.
 * Kept so older settings UI callers don't crash during rollout.
 */
export async function setMemberTreeAccess(input: {
  familyId: string;
  memberId: string;
  canViewTree: boolean;
  canContributeTree: boolean;
}): Promise<void> {
  const canView = input.canContributeTree ? true : input.canViewTree;
  const db = getDb();
  await db
    .update(familyMembers)
    .set({
      canViewTree: canView,
      canContributeTree: input.canContributeTree && canView,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(familyMembers.id, input.memberId),
        eq(familyMembers.familyId, input.familyId),
      ),
    );
}
