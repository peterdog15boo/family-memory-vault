import Link from "next/link";
import { Network } from "lucide-react";
import { FamilyTreeBuilder } from "@/components/family-tree/FamilyTreeBuilder";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import { FacePrivacyNote } from "@/components/people/FacePrivacyNote";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { getTranslations } from "@/lib/i18n/server";
import type { SerializedFamilyTreePerson } from "@/lib/family-tree/serialize";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";

type FamilyTreeWorkspaceProps = {
  peopleCount: number;
  tree: SerializedFamilyTreeGraph;
  availablePeople: SerializedFamilyTreePerson[];
  peopleCovers: FamilyTreePersonCover[];
  canEdit: boolean;
  isOwner: boolean;
  treeSharedWithFamily: boolean;
  familyId: string | null;
};

/**
 * Family Tree workspace — builder (or view-only) for plan owners and shared members.
 */
export async function FamilyTreeWorkspace({
  peopleCount,
  tree,
  availablePeople,
  peopleCovers,
  canEdit,
  isOwner,
  treeSharedWithFamily,
  familyId,
}: FamilyTreeWorkspaceProps) {
  const t = await getTranslations();

  return (
    <>
      <AppPageIntro
        slot="family"
        eyebrow={
          <>
            <Network className="size-3.5" aria-hidden />
            {t("pages.familyTreeEyebrow")}
          </>
        }
        title={
          <>
            {t("pages.familyTreeTitle")}{" "}
            <HintTooltip
              tip={t("tips.familyTree")}
              label={t("pages.familyTreeAbout")}
            />
          </>
        }
        description={
          canEdit
            ? t("pages.familyTreeDescription")
            : "You’re viewing a shared family tree. Ask the family owner if you need edit access."
        }
      />

      <div className="app-page app-page--family-tree app-stack mx-auto max-w-5xl">
        {isOwner && familyId ? (
          <p className="rounded-xl border border-ink/10 bg-canvas/80 px-4 py-3 text-sm text-ink-muted">
            {treeSharedWithFamily
              ? "Shared with your family — manage who can view or contribute in "
              : "Share this tree with invited family and choose who can help build it in "}
            <Link
              href="/family"
              className="font-semibold text-accent-deep underline-offset-2 hover:underline"
            >
              Family settings
            </Link>
            .
          </p>
        ) : null}

        {!canEdit ? (
          <p className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-ink">
            View only — you can explore the tree, but editing is turned off for
            your account.
          </p>
        ) : null}

        <FamilyTreeBuilder
          initialTree={tree}
          initialAvailablePeople={availablePeople}
          peopleCovers={peopleCovers}
          peopleCount={peopleCount}
          canEdit={canEdit}
          isOwner={isOwner}
        />
        <FacePrivacyNote compact className="mt-2" />
      </div>
    </>
  );
}
