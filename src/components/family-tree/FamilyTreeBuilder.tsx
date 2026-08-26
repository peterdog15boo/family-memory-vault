"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Eye, Pencil, X } from "lucide-react";
import { FamilyTreeCanvas } from "@/components/family-tree/FamilyTreeCanvas";
import { FamilyTreeCompleteness } from "@/components/family-tree/FamilyTreeCompleteness";
import { FamilyTreeEmpty } from "@/components/family-tree/FamilyTreeEmpty";
import { FamilyTreeNodePopover } from "@/components/family-tree/FamilyTreeNodePopover";
import { FamilyTreeToolkit } from "@/components/family-tree/FamilyTreeToolkit";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import type {
  SerializedFamilyTreeGraph,
  SerializedFamilyTreePerson,
} from "@/lib/family-tree/serialize";
import { preferredExistingCoParentId } from "@/lib/family-tree/genealogy-iq";
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
  notices?: Array<{ kind?: string; message: string }>;
  scaffold?: {
    message?: string | null;
    createdNodeIds?: string[];
    createdRelationshipIds?: string[];
    undoNodeIds?: string[];
    undoRelationshipIds?: string[];
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
  const [pending, startTransition] = useTransition();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState(false);
  const [viewMounted, setViewMounted] = useState(false);
  const viewContainerRef = useRef<HTMLDivElement>(null);
  const iqNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setViewMounted(true);
  }, []);

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

  async function createNode(body: {
    label: string;
    personId?: string | null;
    link?: {
      type: FamilyTreeRelationType;
      otherNodeId: string;
      newNodeIs: "from" | "to";
    };
  }): Promise<{ id: string; tree?: SerializedFamilyTreeGraph }> {
    const res = await fetch("/api/family-tree/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
    if (!res.ok || !data.node?.id) {
      throw new Error(data.error || "Could not add someone to the tree.");
    }
    if (data.tree) setTree(data.tree);
    applyIqNotices(data);
    applyScaffoldNotice(data);
    return { id: data.node.id, tree: data.tree };
  }

  async function createRel(
    fromNodeId: string,
    toNodeId: string,
    type: FamilyTreeRelationType,
  ): Promise<SerializedFamilyTreeGraph | undefined> {
    const res = await fetch("/api/family-tree/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromNodeId, toNodeId, type }),
    });
    const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
    if (!res.ok) {
      throw new Error(data.error || "Could not save that connection.");
    }
    if (data.tree) setTree(data.tree);
    applyIqNotices(data);
    applyScaffoldNotice(data);
    return data.tree;
  }

  function addPlaceholder(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    runMutation(async () => {
      const created = await createNode({ label: trimmed });
      setSelectedNodeId(created.id);
      await refreshAvailable();
    });
  }

  function placePerson(personId: string) {
    const person = availablePeople.find((p) => p.id === personId);
    if (!person) return;
    runMutation(async () => {
      const created = await createNode({
        label: person.displayName,
        personId: person.id,
      });
      setSelectedNodeId(created.id);
      await refreshAvailable();
    });
  }

  function addParentForChild(childId: string) {
    runMutation(async () => {
      // Prefer linking an existing spouse of a current parent over inventing
      // a new "Parent" placeholder beside a married couple.
      const spouseId = preferredExistingCoParentId(
        tree.relationships,
        childId,
      );
      if (spouseId) {
        await createRel(spouseId, childId, "parent_of");
        setSelectedNodeId(spouseId);
        await refreshAvailable();
        return;
      }

      const parentCount = tree.relationships.filter(
        (r) => r.type === "parent_of" && r.toNodeId === childId,
      ).length;
      if (parentCount >= 2) {
        throw new Error(
          "This person already has two parents. Link an existing relative instead of adding another parent.",
        );
      }

      const created = await createNode({
        label: "Parent",
        link: {
          type: "parent_of",
          otherNodeId: childId,
          newNodeIs: "from",
        },
      });
      setSelectedNodeId(created.id);
      await refreshAvailable();
    });
  }

  function addChildForParent(parentId: string) {
    runMutation(async () => {
      const created = await createNode({
        label: "Child",
        link: {
          type: "parent_of",
          otherNodeId: parentId,
          newNodeIs: "to",
        },
      });
      setSelectedNodeId(created.id);
      await refreshAvailable();
    });
  }

  function addPartnerForNode(nodeId: string) {
    runMutation(async () => {
      const created = await createNode({
        label: "Spouse",
        link: {
          type: "partner_of",
          otherNodeId: nodeId,
          newNodeIs: "from",
        },
      });
      setSelectedNodeId(created.id);
      await refreshAvailable();
    });
  }

  function renameNode(nodeId: string, label: string) {
    runMutation(async () => {
      const res = await fetch(`/api/family-tree/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
      if (!res.ok) throw new Error(data.error || "Could not rename.");
      if (data.tree) setTree(data.tree);
    });
  }

  function linkPerson(nodeId: string, personId: string | null) {
    runMutation(async () => {
      const res = await fetch(`/api/family-tree/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
      if (!res.ok) throw new Error(data.error || "Could not update link.");
      if (data.tree) setTree(data.tree);
      await refreshAvailable();
    });
  }

  function addRelationship(
    fromNodeId: string,
    toNodeId: string,
    type: FamilyTreeRelationType,
  ): Promise<void> {
    return (async () => {
      if (!canEdit) {
        const msg = "You can view this tree but not edit it.";
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      try {
        await createRel(fromNodeId, toNodeId, type);
        setSelectedNodeId(null);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not save that connection.";
        setError(msg);
        throw err instanceof Error ? err : new Error(msg);
      }
    })();
  }

  function undoScaffold() {
    if (!scaffoldNotice) return;
    const payload = {
      nodeIds: scaffoldNotice.undoNodeIds,
      relationshipIds: scaffoldNotice.undoRelationshipIds,
    };
    runMutation(async () => {
      const res = await fetch("/api/family-tree/relationships/undo-scaffold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
      if (!res.ok) throw new Error(data.error || "Could not undo.");
      if (data.tree) setTree(data.tree);
      setScaffoldNotice(null);
      setSelectedNodeId(null);
      await refreshAvailable();
    });
  }

  function removeRelationship(relationshipId: string) {
    runMutation(async () => {
      const res = await fetch(
        `/api/family-tree/relationships/${relationshipId}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
      if (!res.ok) throw new Error(data.error || "Could not remove connection.");
      if (data.tree) setTree(data.tree);
    });
  }

  function removeNode(nodeId: string) {
    runMutation(async () => {
      const res = await fetch(`/api/family-tree/nodes/${nodeId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as ApiTreeResponse;
      if (!res.ok) throw new Error(data.error || "Could not remove member.");
      if (data.tree) setTree(data.tree);
      setSelectedNodeId(null);
      await refreshAvailable();
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
      {iqBanner}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          Build connections below, or open a clean view of your tree.
          {!isOwner ? " You’re helping build a shared family tree." : null}
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

      {completeness}

      <FamilyTreeCanvas
        tree={tree}
        coverByPersonId={coverByPersonId}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onAddParent={addParentForChild}
        onAddChild={addChildForParent}
        onAddPartner={addPartnerForNode}
      />

      {toolkit}

      <FamilyTreeNodePopover
        open={Boolean(selectedNodeId) && !viewMode}
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
        onRemove={removeNode}
      />

      {viewOverlay}
    </div>
  );
}
