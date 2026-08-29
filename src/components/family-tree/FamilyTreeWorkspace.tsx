"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Network } from "lucide-react";
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
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { FamilyTreeFamilyOption } from "@/lib/family-tree/access";
import type {
  SerializedFamilyTreeGraph,
  SerializedFamilyTreePerson,
} from "@/lib/family-tree/serialize";

type FamilySnapshot = {
  familyId: string;
  familyName: string;
  canView: boolean;
  canEdit: boolean;
  isOwner: boolean;
  shareWithMembers: boolean;
  membersCanEdit: boolean;
  hasTree: boolean;
  tree: SerializedFamilyTreeGraph | null;
  availablePeople: SerializedFamilyTreePerson[];
  peopleCovers: FamilyTreePersonCover[];
  peopleCount: number;
};

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

type ApiFamilyTreeResponse = {
  tree?: SerializedFamilyTreeGraph | null;
  availablePeople?: SerializedFamilyTreePerson[];
  peopleCovers?: FamilyTreePersonCover[];
  peopleCount?: number;
  access?: {
    canView?: boolean;
    canEdit?: boolean;
    isOwner?: boolean;
    familyId?: string;
    familyName?: string;
    hasTree?: boolean;
    shareWithMembers?: boolean;
    treeSharedWithFamily?: boolean;
    membersCanEdit?: boolean;
  };
  error?: string;
};

function snapshotFromProps(props: FamilyTreeWorkspaceProps): FamilySnapshot {
  return {
    familyId: props.familyId,
    familyName: props.familyName,
    canView: props.canView,
    canEdit: props.canEdit,
    isOwner: props.isOwner,
    shareWithMembers: props.treeSharedWithFamily,
    membersCanEdit: props.membersCanEdit,
    hasTree: props.hasTree,
    tree: props.tree,
    availablePeople: props.availablePeople,
    peopleCovers: props.peopleCovers,
    peopleCount: props.peopleCount,
  };
}

function writeFamilyIdToUrl(familyId: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("familyId", familyId);
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * Family Tree workspace — one tree per family; client-side picker switch
 * (no full page reload).
 */
export function FamilyTreeWorkspace(props: FamilyTreeWorkspaceProps) {
  const t = useTranslations();
  const [active, setActive] = useState(() => snapshotFromProps(props));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync if server re-renders with the same family (e.g. after share toggle).
  useEffect(() => {
    setActive((prev) => {
      if (prev.familyId !== props.familyId) return prev;
      return snapshotFromProps(props);
    });
  }, [props]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    };
  }, []);

  const selectFamily = useCallback(
    async (nextFamilyId: string) => {
      if (nextFamilyId === active.familyId) return;

      const option = props.families.find((f) => f.familyId === nextFamilyId);
      if (!option) return;

      writeFamilyIdToUrl(nextFamilyId);
      setError(null);

      // Clear previous family’s canvas immediately — no bleed across families.
      setActive({
        familyId: option.familyId,
        familyName: option.familyName,
        canView: option.canView,
        canEdit: option.canEdit,
        isOwner: option.isFamilyCreator,
        shareWithMembers: option.shareWithMembers,
        membersCanEdit: option.membersCanEdit,
        hasTree: option.hasTree,
        tree: null,
        availablePeople: [],
        peopleCovers: [],
        peopleCount: 0,
      });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const gen = ++fetchGen.current;

      if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
      loadTimerRef.current = setTimeout(() => {
        if (fetchGen.current === gen) setLoading(true);
      }, 200);

      try {
        const res = await fetch(
          `/api/family-tree?familyId=${encodeURIComponent(nextFamilyId)}`,
          { signal: controller.signal },
        );
        const data = (await res.json().catch(() => ({}))) as ApiFamilyTreeResponse;
        if (fetchGen.current !== gen) return;

        if (!res.ok) {
          setError(data.error || "Could not load that family tree.");
          setLoading(false);
          return;
        }

        const access = data.access;
        const canView = Boolean(access?.canView);
        setActive({
          familyId: access?.familyId ?? nextFamilyId,
          familyName: access?.familyName ?? option.familyName,
          canView,
          canEdit: Boolean(access?.canEdit),
          isOwner: Boolean(access?.isOwner),
          shareWithMembers: Boolean(
            access?.shareWithMembers ?? access?.treeSharedWithFamily,
          ),
          membersCanEdit: Boolean(access?.membersCanEdit),
          hasTree: Boolean(access?.hasTree ?? option.hasTree),
          // Only keep nodes when this family is viewable — never mix A into B.
          tree: canView ? (data.tree ?? null) : null,
          availablePeople: canView ? (data.availablePeople ?? []) : [],
          peopleCovers: data.peopleCovers ?? [],
          peopleCount: data.peopleCount ?? 0,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (fetchGen.current !== gen) return;
        setError(
          err instanceof Error ? err.message : "Could not load that family tree.",
        );
      } finally {
        if (fetchGen.current === gen) {
          if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
          setLoading(false);
        }
      }
    },
    [active.familyId, props.families],
  );

  const {
    familyId,
    familyName,
    canView,
    canEdit,
    isOwner,
    shareWithMembers,
    membersCanEdit,
    hasTree,
    tree,
    availablePeople,
    peopleCovers,
    peopleCount,
  } = active;

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
          families={props.families.map((f) => ({
            familyId: f.familyId,
            familyName: f.familyName,
            hasTree: f.hasTree,
          }))}
          activeFamilyId={familyId}
          onSelectFamily={(id) => void selectFamily(id)}
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
            key={`share-${familyId}`}
            familyId={familyId}
            familyName={familyName}
            isOwner={isOwner}
            treeSharedWithFamily={shareWithMembers}
            membersCanEdit={membersCanEdit}
          />
        ) : null}

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div
            className="flex min-h-[240px] items-center justify-center rounded-xl border border-ink/10 bg-canvas/80"
            aria-busy="true"
            aria-live="polite"
          >
            <p className="inline-flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading {familyName} tree…
            </p>
          </div>
        ) : null}

        {!loading && notSharedYet ? (
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

        {!loading && canView && !canEdit && hasTree ? (
          <p className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-ink">
            <Lock className="size-3.5 shrink-0 text-accent-deep" aria-hidden />
            View only — you can explore the tree, but edits won’t be saved.
          </p>
        ) : null}

        {!loading && !hasTree ? (
          isOwner ? (
            <CreateFamilyTreeButton
              key={`create-${familyId}`}
              familyId={familyId}
              familyName={familyName}
            />
          ) : (
            <p className="rounded-xl border border-ink/10 bg-canvas/80 px-4 py-6 text-center text-sm text-ink-muted">
              This family doesn’t have a tree yet. Ask the family creator to
              open Family Tree and create one.
            </p>
          )
        ) : null}

        {!loading && canView && hasTree && tree ? (
          <>
            <FamilyTreeBuilder
              key={familyId}
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
