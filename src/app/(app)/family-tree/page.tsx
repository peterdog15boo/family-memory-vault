import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FamilyTreeLockedPage } from "@/components/billing/FamilyTreeLockedPage";
import { FamilyTreeWorkspace } from "@/components/family-tree/FamilyTreeWorkspace";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import { resolveFamilyTreeAccess } from "@/lib/family-tree/access";
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

/**
 * Family Tree — plan owners edit their tree; shared members view/contribute per ACL.
 */
export default async function FamilyTreePage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  const access = await resolveFamilyTreeAccess(userId);
  if (!access?.canView) {
    const gate = await canUseFamilyTree(userId);
    return <FamilyTreeLockedPage gate={gate} />;
  }

  const treeOwnerId = access.treeOwnerId;
  const [peopleCount, graph, availablePeople, peopleWithCovers] =
    await Promise.all([
      countUserPeople(treeOwnerId),
      getFamilyTreeGraph(treeOwnerId),
      access.canEdit
        ? listPeopleAvailableForTree(treeOwnerId)
        : Promise.resolve([]),
      listPeopleWithCovers(treeOwnerId),
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
      tree={serializeFamilyTreeGraph(graph)}
      availablePeople={availablePeople}
      peopleCovers={peopleCovers}
      canEdit={access.canEdit}
      isOwner={access.isOwner}
      treeSharedWithFamily={access.treeSharedWithFamily}
      familyId={access.familyId}
    />
  );
}
