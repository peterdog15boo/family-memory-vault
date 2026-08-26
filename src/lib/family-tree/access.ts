/**
 * Family Tree ACL — owner’s graph may be shared with invited family members.
 * Defaults: share off; when shared, members get view-only until contribute is enabled.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { families, familyMembers } from "@/lib/db/schema";
import { canUseFamilyTree } from "@/lib/plans/gates";

export type FamilyTreeAccessContext = {
  viewerUserId: string;
  /** Vault user whose tree graph is loaded/mutated. */
  treeOwnerId: string;
  canView: boolean;
  canEdit: boolean;
  isOwner: boolean;
  familyId: string | null;
  treeSharedWithFamily: boolean;
};

type SharedRow = {
  familyId: string;
  treeOwnerId: string;
  treeSharedWithFamily: boolean;
  canViewTree: boolean;
  canContributeTree: boolean;
  role: string;
};

async function listSharedTreeMemberships(
  viewerUserId: string,
): Promise<SharedRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      familyId: families.id,
      treeOwnerId: families.createdByUserId,
      treeSharedWithFamily: families.treeSharedWithFamily,
      canViewTree: familyMembers.canViewTree,
      canContributeTree: familyMembers.canContributeTree,
      role: familyMembers.role,
    })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .where(
      and(
        eq(familyMembers.userId, viewerUserId),
        eq(familyMembers.status, "active"),
      ),
    );
  return rows;
}

/**
 * Resolve which tree the viewer should open on /family-tree.
 * Prefer the viewer’s own tree when they have Family Tree plan access;
 * otherwise a shared family-owner tree they may view.
 */
export async function resolveFamilyTreeAccess(
  viewerUserId: string,
): Promise<FamilyTreeAccessContext | null> {
  const gate = await canUseFamilyTree(viewerUserId).catch(() => ({
    allowed: false as const,
  }));

  const memberships = await listSharedTreeMemberships(viewerUserId);
  const ownedFamily = memberships.find((m) => m.treeOwnerId === viewerUserId);

  // Prefer the vault the viewer owns when they have Family Tree on their plan.
  if (gate.allowed && ownedFamily) {
    return {
      viewerUserId,
      treeOwnerId: viewerUserId,
      canView: true,
      canEdit: true,
      isOwner: true,
      familyId: ownedFamily.familyId,
      treeSharedWithFamily: ownedFamily.treeSharedWithFamily,
    };
  }

  const shared = memberships.find(
    (m) =>
      m.treeOwnerId !== viewerUserId &&
      m.treeSharedWithFamily &&
      (m.canViewTree || m.canContributeTree || m.role === "owner"),
  );
  if (shared) {
    const canEdit =
      shared.canContributeTree && shared.role !== "viewer";

    return {
      viewerUserId,
      treeOwnerId: shared.treeOwnerId,
      canView: true,
      canEdit,
      isOwner: false,
      familyId: shared.familyId,
      treeSharedWithFamily: shared.treeSharedWithFamily,
    };
  }

  // Solo plan holder (no family yet, or not invited to a shared tree).
  if (gate.allowed) {
    return {
      viewerUserId,
      treeOwnerId: viewerUserId,
      canView: true,
      canEdit: true,
      isOwner: true,
      familyId: null,
      treeSharedWithFamily: false,
    };
  }

  return null;
}

/** True when the viewer may open Family Tree (own plan or shared view). */
export async function canAccessFamilyTreeNav(
  viewerUserId: string,
): Promise<boolean> {
  const access = await resolveFamilyTreeAccess(viewerUserId);
  return Boolean(access?.canView);
}

/**
 * View the vault owner’s tree — owner always; members only when share + canViewTree.
 */
export async function canViewFamilyTree(
  viewerUserId: string,
  treeOwnerId: string,
): Promise<boolean> {
  if (viewerUserId === treeOwnerId) return true;

  const db = getDb();
  const rows = await db
    .select({
      treeSharedWithFamily: families.treeSharedWithFamily,
      canViewTree: familyMembers.canViewTree,
      canContributeTree: familyMembers.canContributeTree,
      role: familyMembers.role,
    })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .where(
      and(
        eq(familyMembers.userId, viewerUserId),
        eq(familyMembers.status, "active"),
        eq(families.createdByUserId, treeOwnerId),
        eq(families.treeSharedWithFamily, true),
      ),
    );

  return rows.some(
    (r) => r.canViewTree || r.canContributeTree || r.role === "owner",
  );
}

/**
 * Edit the vault owner’s tree — owner always; members need share + canContributeTree
 * and a contribute-capable family role (not viewer-only).
 */
export async function canEditFamilyTree(
  viewerUserId: string,
  treeOwnerId: string,
): Promise<boolean> {
  if (viewerUserId === treeOwnerId) return true;

  const db = getDb();
  const rows = await db
    .select({
      canContributeTree: familyMembers.canContributeTree,
      role: familyMembers.role,
    })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .where(
      and(
        eq(familyMembers.userId, viewerUserId),
        eq(familyMembers.status, "active"),
        eq(families.createdByUserId, treeOwnerId),
        eq(families.treeSharedWithFamily, true),
        eq(familyMembers.canContributeTree, true),
      ),
    );

  return rows.some((r) => r.role === "owner" || r.role === "member");
}

/**
 * Turn Family Tree sharing on/off for a family. Owner-only (caller must check).
 * When enabling: grant view to active non-owner members; contribute stays false.
 * When disabling: clear contribute flags (view flags left; share gate still blocks).
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
