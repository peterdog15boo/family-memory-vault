"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Eye, Pencil, X } from "lucide-react";
import { FamilyTreeCanvas } from "@/components/family-tree/FamilyTreeCanvas";
import { FamilyTreeCompleteness } from "@/components/family-tree/FamilyTreeCompleteness";
import { FamilyTreeEmpty } from "@/components/family-tree/FamilyTreeEmpty";
import { FamilyTreeNodePopover } from "@/components/family-tree/FamilyTreeNodePopover";
import { CousinAddWizard } from "@/components/family-tree/CousinAddWizard";
import { FamilyTreeToolkit } from "@/components/family-tree/FamilyTreeToolkit";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import type {
  SerializedFamilyTreeGraph,
  SerializedFamilyTreePerson,
} from "@/lib/family-tree/serialize";
import type { CousinSide } from "@/lib/family-tree/cousin-side";
import type { GenealogyEngineCommand } from "@/lib/family-tree/engine";
import { correctFamilyTreeLayout } from "@/lib/family-tree/layout-correct";
import { isFamilyTreeRelationType } from "@/lib/family-tree/relations";
import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";

export type { FamilyTreePersonCover } from "@/components/family-tree/types";

type Props = {
  initialTree: SerializedFamilyTreeGraph;
  initialAvailablePeople: SerializedFamilyTreePerson[];
  peopleCovers: FamilyTreePersonCover[];
  peopleCount: number;
  canEdit?: boolean;
  isOwner?: boolean;
};

type ScaffoldNotice = {
  message: string;
  undoNodeIds: string[];
  undoRelationshipIds: string[];
};

type ApiTreeResponse = {
  tree?: SerializedFamilyTreeGraph;
  availablePeople?: SerializedFamilyTreePerson[];
  node?: { id: string };
  focusNodeId?: string | null;
  ok?: boolean;
  notices?: Array<{ kind?: string; message: string }>;
  needsInput?: {
    kind: "cousinSide";
    message: string;
    personId: string;
  };
  pendingConnect?: {
    fromNodeId: string;
    toNodeId: string;
    relationType: FamilyTreeRelationType;
  };
  scaffold?: {
    message?: string | null;
    createdNodeIds?: string[];
    createdRelationshipIds?: string[];
    undoNodeIds?: string[];
    undoRelationshipIds?: string[];
  } | null;
  repair?: {
    applied?: boolean;
    message?: string | null;
  } | null;
  error?: string;
};

/**
 * Interactive family-tree experience — visual canvas + guided starter tools.
 */
export function FamilyTreeBuilder({
  initialTree,
  initialAvailablePeople,
  peopleCovers,
  peopleCount,
  canEdit = true,
  isOwner = true,
}: Props) {
  const [tree, setTree] = useState(initialTree);
  const [availablePeople, setAvailablePeople] = useState(
    initialAvailablePeople,
  );
  const [error, setError] = useState<string | null>(null);
  const [scaffoldNotice, setScaffoldNotice] = useState<ScaffoldNotice | null>(
    null,
  );
  const [iqNotice, setIqNotice] = useState<string | null>(null);
  const [repairNotice, setRepairNotice] = useState<string | null>(
    () =>
      initialTree.repair?.applied && initialTree.repair.message
        ? initialTree.repair.message
        : null,
  );
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [cousinPrompt, setCousinPrompt] = useState<{
    message: string;
    personId: string;
    fromNodeId: string;
    toNodeId: string;
    relationType: FamilyTreeRelationType;
  } | null>(null);
  const [cousinWizardSubjectId, setCousinWizardSubjectId] = useState<
    string | null
  >(null);
  const [pending, startTransition] = useTransition();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [viewMounted, setViewMounted] = useState(false);
  const viewContainerRef = useRef<HTMLDivElement>(null);
  const iqNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setViewMounted(true);
  }, []);

  // One-time layout correction assess on load — positions are derived from
  // relationships; this detects when Layout IQ reflows a previously naive chart
  // or when edge projection would mismatch the dialog source of truth.
  useEffect(() => {
    if (tree.nodes.length === 0) return;
    const edges = tree.relationships
      .filter((r) => isFamilyTreeRelationType(r.type))
      .map((r) => ({
        id: r.id,
        fromNodeId: r.fromNodeId,
        toNodeId: r.toNodeId,
        type: r.type,
      }));
    const result = correctFamilyTreeLayout(
      tree.nodes.map((n) => ({
        id: n.id,
        generation: n.generation,
        label: n.label,
      })),
      edges,
    );
    const projectionOk = result.layout.edgeVerification.ok;
    if (!result.corrected && projectionOk) return;

    const noticeKey = `ft-display-repaired:${tree.nodes
      .map((n) => n.id)
      .sort()
      .join(",")
      .slice(0, 120)}`;
    try {
      if (sessionStorage.getItem(noticeKey) === "1") return;
      sessionStorage.setItem(noticeKey, "1");
    } catch {
      // sessionStorage may be unavailable
    }
    setLayoutNotice(
      result.message ??
        "We repaired the tree display so every saved relationship shows on the chart.",
    );
    setLayoutRevision((n) => n + 1);
  }, [tree.nodes, tree.relationships]);

  useEffect(() => {
    return () => {
      if (iqNoticeTimerRef.current != null) {
        window.clearTimeout(iqNoticeTimerRef.current);
      }
    };
  }, []);

  useOverlayA11y({
    open: viewMode,
    onClose: () => setViewMode(false),
    containerRef: viewContainerRef,
    escapeEnabled: true,
    trapFocus: true,
    lockScroll: true,
  });

  const coverByPersonId = useMemo(() => {
    const map = new Map<string, FamilyTreePersonCover>();
    for (const cover of peopleCovers) map.set(cover.personId, cover);
    return map;
  }, [peopleCovers]);

  async function refreshAvailable() {
    const res = await fetch("/api/family-tree");
    const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
    if (!res.ok) throw new Error(data.error || "Could not refresh tree.");
    if (data.tree) setTree(data.tree);
    if (data.availablePeople) setAvailablePeople(data.availablePeople);
  }

  function runMutation(task: () => Promise<void>) {
    if (!canEdit) {
      setError("You can view this tree but not edit it.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function applyScaffoldNotice(data: ApiTreeResponse) {
    const scaffold = data.scaffold;
    if (!scaffold?.message) {
      setScaffoldNotice(null);
      return;
    }
    setScaffoldNotice({
      message: scaffold.message,
      undoNodeIds: scaffold.undoNodeIds ?? scaffold.createdNodeIds ?? [],
      undoRelationshipIds:
        scaffold.undoRelationshipIds ??
        scaffold.createdRelationshipIds ??
        [],
    });
  }

  function applyIqNotices(data: ApiTreeResponse) {
    const messages = (data.notices ?? [])
      .map((n) => n.message?.trim())
      .filter((m): m is string => Boolean(m));
    if (messages.length === 0) return;
    setIqNotice(messages.join(" "));
    if (iqNoticeTimerRef.current != null) {
      window.clearTimeout(iqNoticeTimerRef.current);
    }
    iqNoticeTimerRef.current = window.setTimeout(() => {
      setIqNotice(null);
      iqNoticeTimerRef.current = null;
    }, 6000);
  }

  /**
   * Sole Family Tree write path from the UI — Genealogy Relationship Engine.
   */
  async function runEngineCommand(
    command: GenealogyEngineCommand,
  ): Promise<ApiTreeResponse> {
    const res = await fetch("/api/family-tree/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
    if (res.status === 409 && data.needsInput?.kind === "cousinSide") {
      if (data.tree) setTree(data.tree);
      return data;
    }
    if (!res.ok) {
      throw new Error(data.error || "Could not update the family tree.");
    }
    if (data.tree) setTree(data.tree);
    applyIqNotices(data);
    applyScaffoldNotice(data);
    if (data.tree?.repair?.applied && data.tree.repair.message) {
      setRepairNotice(data.tree.repair.message);
    }
    if (data.focusNodeId) setSelectedNodeId(data.focusNodeId);
    return data;
  }

  function addPlaceholder(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    runMutation(async () => {
      await runEngineCommand({ type: "addPlaceholder", label: trimmed });
      await refreshAvailable();
    });
  }

  function placePerson(personId: string) {
    const person = availablePeople.find((p) => p.id === personId);
    if (!person) return;
    runMutation(async () => {
      await runEngineCommand({
        type: "placePerson",
        peopleId: person.id,
        label: person.displayName,
      });
      await refreshAvailable();
    });
  }

  function addParentForChild(childId: string) {
    runMutation(async () => {
      await runEngineCommand({ type: "addParent", personId: childId });
      await refreshAvailable();
    });
  }

  function addChildForParent(parentId: string) {
    runMutation(async () => {
      await runEngineCommand({ type: "addChild", personId: parentId });
      await refreshAvailable();
    });
  }

  function addPartnerForNode(nodeId: string) {
    runMutation(async () => {
      await runEngineCommand({ type: "addSpouse", personId: nodeId });
      await refreshAvailable();
    });
  }

  function openCousinWizard(personId: string) {
    setError(null);
    setCousinWizardSubjectId(personId);
  }

  function submitCousinWizard(payload: {
    personId: string;
    label: string;
    cousinPeopleId: string | null;
    parent1Label: string;
    parent2Label: string;
    attachWhich: "parent1" | "parent2" | "unsure";
    attachToNodeId: string;
  }) {
    runMutation(async () => {
      await runEngineCommand({
        type: "addCousin",
        personId: payload.personId,
        label: payload.label,
        parent1Label: payload.parent1Label,
        parent2Label: payload.parent2Label || undefined,
        cousinPeopleId: payload.cousinPeopleId,
        attachWhich: payload.attachWhich,
        attachToNodeId: payload.attachToNodeId,
      });
      setCousinWizardSubjectId(null);
      setSelectedNodeId(null);
      await refreshAvailable();
    });
  }

  function renameNode(nodeId: string, label: string) {
    runMutation(async () => {
      await runEngineCommand({ type: "renameNode", nodeId, label });
    });
  }

  function linkPerson(nodeId: string, personId: string | null) {
    runMutation(async () => {
      await runEngineCommand({
        type: "linkPlaceholderToPerson",
        nodeId,
        peopleId: personId,
      });
      await refreshAvailable();
    });
  }

  function addRelationship(
    fromNodeId: string,
    toNodeId: string,
    type: FamilyTreeRelationType,
    cousinSide?: CousinSide,
  ): Promise<void> {
    return (async () => {
      if (!canEdit) {
        const msg = "You can view this tree but not edit it.";
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      try {
        const data = await runEngineCommand({
          type: "connect",
          fromNodeId,
          toNodeId,
          relationType: type,
          cousinSide,
        });
        if (data.needsInput?.kind === "cousinSide") {
          setCousinPrompt({
            message: data.needsInput.message,
            personId: data.needsInput.personId,
            fromNodeId,
            toNodeId,
            relationType: type,
          });
          return;
        }
        setCousinPrompt(null);
        setSelectedNodeId(null);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not save that connection.";
        setError(msg);
        throw err instanceof Error ? err : new Error(msg);
      }
    })();
  }

  function resolveCousinSide(side: CousinSide) {
    if (!cousinPrompt) return;
    const pending = cousinPrompt;
    setCousinPrompt(null);
    void addRelationship(
      pending.fromNodeId,
      pending.toNodeId,
      pending.relationType,
      side,
    );
  }

  function undoScaffold() {
    if (!scaffoldNotice) return;
    const payload = {
      nodeIds: scaffoldNotice.undoNodeIds,
      relationshipIds: scaffoldNotice.undoRelationshipIds,
    };
    runMutation(async () => {
      await runEngineCommand({
        type: "undoScaffold",
        nodeIds: payload.nodeIds,
        relationshipIds: payload.relationshipIds,
      });
      setScaffoldNotice(null);
      setSelectedNodeId(null);
      await refreshAvailable();
    });
  }

  function removeRelationship(relationshipId: string) {
    runMutation(async () => {
      await runEngineCommand({
        type: "removeRelationship",
        edgeId: relationshipId,
      });
    });
  }

  function removeNode(nodeId: string) {
    runMutation(async () => {
      await runEngineCommand({ type: "deleteNode", nodeId });
      setSelectedNodeId(null);
      await refreshAvailable();
    });
  }

  function clearNodeReview(nodeId: string) {
    runMutation(async () => {
      await runEngineCommand({ type: "clearNodeReview", nodeId });
    });
  }

  function fixTreeLayout() {
    runMutation(async () => {
      // Refresh canonical graph from server, then force Layout IQ + edge projection.
      await runEngineCommand({ type: "correctLayout" });
      await refreshAvailable();
      setLayoutRevision((n) => n + 1);
      setLayoutNotice(
        "We repaired the tree display so every saved relationship shows on the chart.",
      );
    });
  }

  function exportTreeDebugJson() {
    runMutation(async () => {
      const res = await fetch("/api/family-tree/export");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Could not export tree debug JSON.");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "family-tree-debug.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function focusAddPerson() {
    const el = document.getElementById("family-tree-add-by-name");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = el?.querySelector("input");
    if (input instanceof HTMLInputElement) {
      window.setTimeout(() => input.focus(), 320);
    }
  }

  function openViewMode() {
    setSelectedNodeId(null);
    setViewMode(true);
  }

  const cousinSideBanner =
    cousinPrompt && canEdit ? (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5 text-sm text-ink"
        role="dialog"
        aria-label="Cousin side"
      >
        <p className="min-w-0 flex-1 leading-snug">{cousinPrompt.message}</p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            disabled={pending}
            onClick={() => resolveCousinSide("maternal")}
          >
            Mom’s side (maternal)
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            disabled={pending}
            onClick={() => resolveCousinSide("paternal")}
          >
            Dad’s side (paternal)
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm"
            disabled={pending}
            onClick={() => resolveCousinSide("unknown")}
          >
            Not sure
          </button>
          <button
            type="button"
            className="rounded-md p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Cancel"
            onClick={() => setCousinPrompt(null)}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    ) : null;

  const scaffoldBanner =
    scaffoldNotice && canEdit ? (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5 text-sm text-ink"
        role="status"
      >
        <p className="min-w-0 flex-1 leading-snug">{scaffoldNotice.message}</p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            disabled={pending}
            onClick={undoScaffold}
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded-md p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Dismiss"
            onClick={() => setScaffoldNotice(null)}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    ) : null;

  const iqBanner = iqNotice ? (
    <div
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-ink/10 bg-canvas px-3 py-1.5 text-sm text-ink shadow-sm"
      role="status"
    >
      <span className="min-w-0 truncate">{iqNotice}</span>
      <button
        type="button"
        className="rounded-full p-0.5 text-ink-muted hover:bg-ink/5 hover:text-ink"
        aria-label="Dismiss"
        onClick={() => setIqNotice(null)}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  ) : null;

  const repairBanner = repairNotice ? (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-canvas px-3 py-2.5 text-sm text-ink shadow-sm"
      role="status"
    >
      <p className="min-w-0 flex-1 leading-snug">{repairNotice}</p>
      <button
        type="button"
        className="rounded-md p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink"
        aria-label="Dismiss"
        onClick={() => setRepairNotice(null)}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  ) : null;

  const layoutBanner = layoutNotice ? (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-canvas px-3 py-2.5 text-sm text-ink shadow-sm"
      role="status"
    >
      <p className="min-w-0 flex-1 leading-snug">{layoutNotice}</p>
      <button
        type="button"
        className="rounded-md p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink"
        aria-label="Dismiss"
        onClick={() => setLayoutNotice(null)}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  ) : null;

  const completeness = (
    <FamilyTreeCompleteness
      tree={tree}
      peopleCount={peopleCount}
      availablePeople={availablePeople}
      coverByPersonId={coverByPersonId}
      onPlacePerson={placePerson}
      onAddParent={addParentForChild}
      onAddPartner={addPartnerForNode}
      onSelectNode={setSelectedNodeId}
      onFocusAddPerson={focusAddPerson}
    />
  );

  const toolkit = (
    <FamilyTreeToolkit
      tree={tree}
      availablePeople={availablePeople}
      coverByPersonId={coverByPersonId}
      pending={pending}
      onPlacePerson={placePerson}
      onAddPlaceholder={addPlaceholder}
      onConnect={addRelationship}
    />
  );

  const viewOverlay =
    viewMounted && viewMode
      ? createPortal(
          <div
            ref={viewContainerRef}
            className="family-tree-view-mode"
            role="dialog"
            aria-modal="true"
            aria-label="View family tree"
          >
            <header className="family-tree-view-mode-bar">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-accent-deep">
                  View Tree
                </p>
                <p className="truncate text-sm text-ink-muted">
                  Pan and zoom · no editing
                </p>
              </div>
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm"
                onClick={() => setViewMode(false)}
              >
                {canEdit ? (
                  <>
                    <Pencil className="size-3.5" aria-hidden />
                    Back to editing
                  </>
                ) : (
                  <>
                    <X className="size-3.5" aria-hidden />
                    Close
                  </>
                )}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-sm"
                  aria-label="Close view"
                  onClick={() => setViewMode(false)}
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </header>
            <div className="family-tree-view-mode-canvas">
              <FamilyTreeCanvas
                tree={tree}
                coverByPersonId={coverByPersonId}
                selectedNodeId={null}
                onSelectNode={() => undefined}
                onAddParent={() => undefined}
                onAddChild={() => undefined}
                onAddPartner={() => undefined}
                viewOnly
                layoutRevision={layoutRevision}
                className="family-tree-viewport-shell--fill"
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  if (tree.nodes.length === 0) {
    if (!canEdit) {
      return (
        <div className="space-y-6">
          <p className="rounded-xl border border-ink/10 px-4 py-8 text-center text-sm text-ink-muted">
            This shared family tree is empty for now.
          </p>
        </div>
      );
    }
    return (
      <div className="space-y-8">
        <FamilyTreeEmpty peopleCount={peopleCount} />
        {error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {scaffoldBanner}
        {cousinSideBanner}
        {repairBanner}
        {layoutBanner}
        {iqBanner}
        {completeness}
        {toolkit}
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            Explore the shared tree — pan and zoom anytime.
          </p>
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            onClick={openViewMode}
          >
            <Eye className="size-3.5" aria-hidden />
            View Tree
          </button>
        </div>
        <FamilyTreeCanvas
          tree={tree}
          coverByPersonId={coverByPersonId}
          selectedNodeId={null}
          onSelectNode={() => undefined}
          onAddParent={() => undefined}
          onAddChild={() => undefined}
          onAddPartner={() => undefined}
          viewOnly
          layoutRevision={layoutRevision}
        />
        {viewOverlay}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {scaffoldBanner}
      {cousinSideBanner}
      {repairBanner}
      {layoutBanner}
      {iqBanner}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Build connections below, or open a clean view of your tree.
          {!isOwner ? " You’re helping build a shared family tree." : null}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm"
            disabled={pending}
            onClick={fixTreeLayout}
          >
            Repair tree display
          </button>
          {isOwner ? (
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-sm"
              disabled={pending}
              onClick={exportTreeDebugJson}
            >
              Export tree debug JSON
            </button>
          ) : null}
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            onClick={openViewMode}
          >
            <Eye className="size-3.5" aria-hidden />
            View Tree
          </button>
        </div>
      </div>

      {completeness}

      <FamilyTreeCanvas
        tree={tree}
        coverByPersonId={coverByPersonId}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onAddParent={addParentForChild}
        onAddChild={addChildForParent}
        onAddPartner={addPartnerForNode}
        layoutRevision={layoutRevision}
      />

      {toolkit}

      <FamilyTreeNodePopover
        open={Boolean(selectedNodeId) && !viewMode && !cousinWizardSubjectId}
        nodeId={selectedNodeId}
        tree={tree}
        availablePeople={availablePeople}
        coverByPersonId={coverByPersonId}
        pending={pending}
        onClose={() => setSelectedNodeId(null)}
        onRename={renameNode}
        onLinkPerson={linkPerson}
        onAddRelationship={addRelationship}
        onRemoveRelationship={removeRelationship}
        onAddParent={addParentForChild}
        onAddChild={addChildForParent}
        onAddPartner={addPartnerForNode}
        onAddCousin={openCousinWizard}
        onRemove={removeNode}
        onClearReview={clearNodeReview}
      />

      <CousinAddWizard
        open={Boolean(cousinWizardSubjectId) && canEdit}
        subjectId={cousinWizardSubjectId}
        tree={tree}
        availablePeople={availablePeople}
        pending={pending}
        onClose={() => setCousinWizardSubjectId(null)}
        onSubmit={submitCousinWizard}
      />

      {viewOverlay}
    </div>
  );
}
