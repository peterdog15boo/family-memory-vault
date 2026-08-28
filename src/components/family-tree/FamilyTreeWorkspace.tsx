import Link from "next/link";
import { Network } from "lucide-react";
import { FamilyTreeBuilder } from "@/components/family-tree/FamilyTreeBuilder";
import { FamilyTreeFamilyPicker } from "@/components/family-tree/FamilyTreeFamilyPicker";
import {
  CreateFamilyTreeButton,
  FamilyTreePageShareControls,
} from "@/components/family-tree/FamilyTreePageShareControls";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import { FacePrivacyNote } from "@/components/people/FacePrivacyNote";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { getTranslations } from "@/lib/i18n/server";
import type { FamilyTreeFamilyOption } from "@/lib/family-tree/access";
import type { SerializedFamilyTreePerson } from "@/lib/family-tree/serialize";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";

type FamilyTreeWorkspaceProps = {
  peopleCount: number;
  tree: SerializedFamilyTreeGraph | null;
  availablePeople: SerializedFamilyTreePerson[];
  peopleCovers: FamilyTreePersonCover[];
  canEdit: boolean;
  isOwner: boolean;
  treeSharedWithFamily: boolean;
  familyId: string;
  familyName: string;
  hasTree: boolean;
  families: FamilyTreeFamilyOption[];
};

/**
 * Family Tree workspace — one tree per family, with picker when multi-family.
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
  familyName,
  hasTree,
  families,
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
            Tree for {familyName}{" "}
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
        <FamilyTreeFamilyPicker
          families={families.map((f) => ({
            familyId: f.familyId,
            familyName: f.familyName,
            hasTree: f.hasTree,
          }))}
          activeFamilyId={familyId}
        />

        <p className="text-sm text-ink-muted">
          This tree belongs to the {familyName} family.
          {isOwner ? (
            <>
              {" "}
              Manage invites in{" "}
              <Link
                href="/family"
                className="font-semibold text-accent-deep underline-offset-2 hover:underline"
              >
                Family settings
              </Link>
              .
            </>
          ) : null}
        </p>

        {hasTree ? (
          <FamilyTreePageShareControls
            familyId={familyId}
            familyName={familyName}
            isOwner={isOwner}
            treeSharedWithFamily={treeSharedWithFamily}
          />
        ) : null}

        {!canEdit && hasTree ? (
          <p className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-ink">
            View only — you can explore the tree, but editing is turned off for
            your account.
          </p>
        ) : null}

        {!hasTree ? (
          isOwner ? (
            <CreateFamilyTreeButton
              familyId={familyId}
              familyName={familyName}
            />
          ) : (
            <p className="rounded-xl border border-ink/10 bg-canvas/80 px-4 py-6 text-center text-sm text-ink-muted">
              This family doesn’t have a tree yet. Ask the family creator to
              open Family Tree and create one.
            </p>
          )
        ) : tree ? (
          <>
            <FamilyTreeBuilder
              initialTree={tree}
              initialAvailablePeople={availablePeople}
              peopleCovers={peopleCovers}
              peopleCount={peopleCount}
              canEdit={canEdit}
              isOwner={isOwner}
              familyId={familyId}
            />
            <FacePrivacyNote compact className="mt-2" />
          </>
        ) : null}
      </div>
    </>
  );
}
