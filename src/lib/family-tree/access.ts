/**
 * Family Tree ACL — trees belong to a familyId; membership grants access.
 * Inviting someone to the family is what grants tree access (no second invite system).
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { families, familyMembers, familyTrees } from "@/lib/db/schema";
import { canUseFamilyTree } from "@/lib/plans/gates";
import type { FamilyTreeScope } from "@/lib/family-tree/scope";

export type FamilyTreeFamilyOption = {
  familyId: string;
  familyName: string;
  peopleOwnerId: string;
  hasTree: boolean;
  canView: boolean;
  canEdit: boolean;
  isFamilyCreator: boolean;
  treeSharedWithFamily: boolean;
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
  treeSharedWithFamily: boolean;
  hasTree: boolean;
  /** Other families the viewer can open (for the picker). */
  families: FamilyTreeFamilyOption[];
};

type MembershipRow = {
  familyId: string;
  familyName: string;
  peopleOwnerId: string;
  treeSharedWithFamily: boolean;
  canViewTree: boolean;
  canContributeTree: boolean;
  role: string;
  hasTree: boolean;
};

async function listFamilyTreeMemberships(
  viewerUserId: string,
): Promise<MembershipRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      familyId: families.id,
      familyName: families.name,
      peopleOwnerId: families.createdByUserId,
      treeSharedWithFamily: families.treeSharedWithFamily,
      canViewTree: familyMembers.canViewTree,
      canContributeTree: familyMembers.canContributeTree,
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
    canViewTree: r.canViewTree,
    canContributeTree: r.canContributeTree,
    role: r.role,
    hasTree: Boolean(r.treeFamilyId),
  }));
}

/** Pure ACL for one membership row — exported for tests. */
export function familyTreeAccessFromMembership(
  m: {
    familyId: string;
    familyName: string;
    peopleOwnerId: string;
    treeSharedWithFamily: boolean;
    canViewTree: boolean;
    canContributeTree: boolean;
    role: string;
    hasTree: boolean;
  },
  viewerUserId: string,
): FamilyTreeFamilyOption {
  const isFamilyCreator = m.peopleOwnerId === viewerUserId;
  // Default: members view when share is on; edit only with contribute toggle.
  const canView =
    isFamilyCreator ||
    (m.treeSharedWithFamily &&
      (m.canViewTree || m.canContributeTree || m.role === "owner"));
  const canEdit =
    isFamilyCreator ||
    (m.treeSharedWithFamily &&
      m.canContributeTree &&
      (m.role === "owner" || m.role === "member"));

  return {
    familyId: m.familyId,
    familyName: m.familyName,
    peopleOwnerId: m.peopleOwnerId,
    hasTree: m.hasTree,
    canView,
    canEdit,
    isFamilyCreator,
    treeSharedWithFamily: m.treeSharedWithFamily,
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
 * List families the viewer may open on Family Tree (view access).
 */
export async function listFamilyTreeOptions(
  viewerUserId: string,
): Promise<FamilyTreeFamilyOption[]> {
  const memberships = await listFamilyTreeMemberships(viewerUserId);
  return memberships
    .map((m) => optionFromMembership(m, viewerUserId))
    .filter((o) => o.canView);
}

/**
 * Resolve which family tree the viewer should open.
 * Prefer `preferredFamilyId` when the viewer can access it.
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

  // Explicit familyId that the viewer cannot open → deny (do not fall back).
  if (preferredFamilyId && !preferred) {
    return null;
  }

  // Prefer a family where the viewer is creator and has plan access.
  const gate = await canUseFamilyTree(viewerUserId).catch(() => ({
    allowed: false as const,
  }));
  const ownedWithPlan = gate.allowed
    ? options.find((o) => o.isFamilyCreator)
    : undefined;

  const active = preferred || ownedWithPlan || options[0]!;
  if (!active?.canView) return null;

  return {
    viewerUserId,
    familyId: active.familyId,
    familyName: active.familyName,
    peopleOwnerId: active.peopleOwnerId,
    treeOwnerId: active.peopleOwnerId,
    canView: active.canView,
    canEdit: active.canEdit,
    isOwner: active.isFamilyCreator,
    treeSharedWithFamily: active.treeSharedWithFamily,
    hasTree: active.hasTree,
    families: options,
  };
}

export async function canAccessFamilyTreeNav(
  viewerUserId: string,
): Promise<boolean> {
  const options = await listFamilyTreeOptions(viewerUserId);
  if (options.length > 0) return true;
  // Plan holders with no family yet still see nav → empty “create a family” path.
  const gate = await canUseFamilyTree(viewerUserId).catch(() => ({
    allowed: false as const,
  }));
  return gate.allowed;
}

/**
 * View a family's tree — creator always; members when share + canViewTree.
 */
export async function canViewFamilyTree(
  viewerUserId: string,
  familyId: string,
): Promise<boolean> {
  const options = await listFamilyTreeOptions(viewerUserId);
  return options.some((o) => o.familyId === familyId && o.canView);
}

/**
 * Edit a family's tree — creator always; members need contribute + member/owner role.
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
 * Ensure a family_trees row exists (idempotent). Enables share + member view.
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

  await db
    .update(families)
    .set({
      treeSharedWithFamily: true,
      updatedAt: new Date(),
    })
    .where(eq(families.id, input.familyId));

  await db
    .update(familyMembers)
    .set({
      canViewTree: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(familyMembers.familyId, input.familyId),
        inArray(familyMembers.status, ["active", "pending"]),
      ),
    );
}

/**
 * Turn Family Tree sharing on/off for a family. Creator-only (caller must check).
 */
export async function setFamilyTreeSharing(input: {
  familyId: string;
  shared: boolean;
}): Promise<void> {
  const db = getDb();
  await db
    .update(families)
    .set({
      treeSharedWithFamily: input.shared,
      updatedAt: new Date(),
    })
    .where(eq(families.id, input.familyId));

  if (input.shared) {
    await db
      .update(familyMembers)
      .set({
        canViewTree: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(familyMembers.familyId, input.familyId),
          inArray(familyMembers.status, ["active", "pending"]),
        ),
      );
  } else {
    await db
      .update(familyMembers)
      .set({
        canContributeTree: false,
        updatedAt: new Date(),
      })
      .where(eq(familyMembers.familyId, input.familyId));
  }
}

/**
 * Per-member Family Tree toggles. Contribute implies view.
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
