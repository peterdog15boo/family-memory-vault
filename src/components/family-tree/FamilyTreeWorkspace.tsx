import Link from "next/link";
import { Lock, Network } from "lucide-react";
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
  canView: boolean;
  isOwner: boolean;
  treeSharedWithFamily: boolean;
  membersCanEdit: boolean;
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
  canView,
  isOwner,
  treeSharedWithFamily,
  membersCanEdit,
  familyId,
  familyName,
  hasTree,
  families,
}: FamilyTreeWorkspaceProps) {
  const t = await getTranslations();
  const notSharedYet = hasTree && !canView && !isOwner;

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
          notSharedYet
            ? `The ${familyName} tree isn’t shared yet.`
            : canEdit
              ? t("pages.familyTreeDescription")
              : "You’re viewing a shared family tree. Ask the family creator if you need edit access."
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

        {hasTree && isOwner ? (
          <FamilyTreePageShareControls
            familyId={familyId}
            familyName={familyName}
            isOwner={isOwner}
            treeSharedWithFamily={treeSharedWithFamily}
            membersCanEdit={membersCanEdit}
          />
        ) : null}

        {notSharedYet ? (
          <div className="rounded-xl border border-ink/10 bg-canvas/90 px-5 py-8 text-center">
            <Lock className="mx-auto size-8 text-ink-muted" aria-hidden />
            <p className="mt-3 text-lg font-semibold text-ink">
              The {familyName} tree isn’t shared yet.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
              The family creator can share this tree from Family Tree or Family
              settings. Inviting you to the family does not share the tree by
              itself.
            </p>
          </div>
        ) : null}

        {canView && !canEdit && hasTree ? (
          <p className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-ink">
            <Lock className="size-3.5 shrink-0 text-accent-deep" aria-hidden />
            View only — you can explore the tree, but edits won’t be saved.
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
        ) : canView && tree ? (
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
