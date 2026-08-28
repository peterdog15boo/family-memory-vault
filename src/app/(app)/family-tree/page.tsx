import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FamilyTreeLockedPage } from "@/components/billing/FamilyTreeLockedPage";
import { FamilyTreeWorkspace } from "@/components/family-tree/FamilyTreeWorkspace";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import {
  resolveFamilyTreeAccess,
  scopeFromAccess,
} from "@/lib/family-tree/access";
import {
  getFamilyTreeGraph,
  listPeopleAvailableForTree,
} from "@/lib/family-tree";
import { serializeFamilyTreeGraph } from "@/lib/family-tree/serialize";
import { canUseFamilyTree, countUserPeople } from "@/lib/plans/gates";
import { listPeopleWithCovers } from "@/lib/people/queries";
import { ensureAppUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Family Tree — Family Memory Vault",
  description:
    "Map the people you love into a living family tree — warm, visual, and made for families.",
};

type PageProps = {
  searchParams: Promise<{ familyId?: string }>;
};

/**
 * Family Tree — one tree per family; picker when the user has multiple families.
 */
export default async function FamilyTreePage({ searchParams }: PageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);

  const params = await searchParams;
  const preferredFamilyId =
    typeof params.familyId === "string" ? params.familyId.trim() : null;

  const access = await resolveFamilyTreeAccess(userId, preferredFamilyId);
  if (!access?.canView) {
    // Explicit family they cannot open — send them to a tree they can.
    if (preferredFamilyId) {
      const fallback = await resolveFamilyTreeAccess(userId);
      if (fallback?.canView) {
        redirect(
          `/family-tree?familyId=${encodeURIComponent(fallback.familyId)}`,
        );
      }
    }
    const gate = await canUseFamilyTree(userId);
    return <FamilyTreeLockedPage gate={gate} />;
  }

  const scope = scopeFromAccess(access);
  const peopleOwnerId = access.peopleOwnerId;

  // Load graph only when the family already has a tree registry row.
  const [peopleCount, graph, availablePeople, peopleWithCovers] =
    await Promise.all([
      countUserPeople(peopleOwnerId),
      access.hasTree
        ? getFamilyTreeGraph(scope)
        : Promise.resolve(null),
      access.hasTree && access.canEdit
        ? listPeopleAvailableForTree(scope)
        : Promise.resolve([]),
      listPeopleWithCovers(peopleOwnerId),
    ]);

  const peopleCovers: FamilyTreePersonCover[] = peopleWithCovers.map((p) => ({
    personId: p.id,
    previewUrl: p.cover?.media.previewUrl ?? null,
    boundingBox: p.cover?.boundingBox ?? null,
    framing: {
      avatarFocusX: p.avatarFocusX,
      avatarFocusY: p.avatarFocusY,
      avatarZoom: p.avatarZoom,
    },
  }));

  return (
    <FamilyTreeWorkspace
      peopleCount={peopleCount}
      tree={graph ? serializeFamilyTreeGraph(graph) : null}
      availablePeople={availablePeople}
      peopleCovers={peopleCovers}
      canEdit={access.canEdit}
      isOwner={access.isOwner}
      treeSharedWithFamily={access.treeSharedWithFamily}
      familyId={access.familyId}
      familyName={access.familyName}
      hasTree={access.hasTree}
      families={access.families}
    />
  );
}
