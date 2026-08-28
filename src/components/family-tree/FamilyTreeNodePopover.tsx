"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Baby,
  ExternalLink,
  Heart,
  Link2,
  Loader2,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { FamilyTreePersonCover } from "@/components/family-tree/types";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import type { FamilyTreeRelationType } from "@/lib/db/schema";
import type {
  SerializedFamilyTreeGraph,
  SerializedFamilyTreePerson,
} from "@/lib/family-tree/serialize";
import { treeNodeInitials } from "@/lib/family-tree/layout";
import {
  FAMILY_TREE_RELATION_CHOICES,
  describeRelationFromViewer,
  isFamilyTreeRelationType,
  resolveRelationChoice,
  type FamilyTreeRelationChoiceId,
} from "@/lib/family-tree/relations";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  nodeId: string | null;
  tree: SerializedFamilyTreeGraph;
  availablePeople: SerializedFamilyTreePerson[];
  coverByPersonId: Map<string, FamilyTreePersonCover>;
  pending: boolean;
  onClose: () => void;
  onRename: (nodeId: string, label: string) => void;
  onLinkPerson: (nodeId: string, personId: string | null) => void;
  onAddRelationship: (
    fromNodeId: string,
    toNodeId: string,
    type: FamilyTreeRelationType,
  ) => void | Promise<void>;
  onRemoveRelationship: (relationshipId: string) => void;
  onAddParent: (childId: string) => void;
  onAddChild: (parentId: string) => void;
  onAddPartner: (nodeId: string) => void;
  onAddSibling: (nodeId: string) => void;
  onRemove: (nodeId: string) => void;
  onClearReview?: (nodeId: string) => void;
};

/**
 * Detail / edit sheet — guided family actions first; People is the identity source.
 */
export function FamilyTreeNodePopover({
  open,
  nodeId,
  tree,
  availablePeople,
  coverByPersonId,
  pending,
  onClose,
  onRename,
  onLinkPerson,
  onAddRelationship,
  onRemoveRelationship,
  onAddParent,
  onAddChild,
  onAddPartner,
  onAddSibling,
  onRemove,
  onClearReview,
}: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const node = tree.nodes.find((n) => n.id === nodeId) ?? null;
  const [label, setLabel] = useState(node?.label ?? "");
  const [linkPersonId, setLinkPersonId] = useState("");
  const [relOtherId, setRelOtherId] = useState("");
  const [relChoice, setRelChoice] = useState<FamilyTreeRelationChoiceId>("parent");
  const [linkQuery, setLinkQuery] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setLabel(node?.label ?? "");
    setLinkPersonId("");
    setRelOtherId("");
    setRelChoice("parent");
    setLinkQuery("");
    setConnectError(null);
    setConnecting(false);
  }, [node?.id, node?.label]);

  useOverlayA11y({
    open: open && Boolean(node),
    onClose,
    containerRef: panelRef,
    escapeEnabled: true,
    trapFocus: true,
    lockScroll: false,
  });

  if (!open || !node) return null;

  const cover = node.personId ? coverByPersonId.get(node.personId) : null;
  const others = tree.nodes.filter((n) => n.id !== node.id);
  const nodeById = new Map(tree.nodes.map((n) => [n.id, n]));
  const nodeRels = tree.relationships.filter(
    (r) =>
      (r.fromNodeId === node.id || r.toNodeId === node.id) &&
      isFamilyTreeRelationType(r.type),
  );
  const linkMatches = availablePeople.filter((p) => {
    const q = linkQuery.trim().toLowerCase();
    if (!q) return true;
    return p.displayName.toLowerCase().includes(q);
  });
  const peopleHref =
    node.personId && !node.isPlaceholder ? `/people/${node.personId}` : null;

  return (
    <div className="family-tree-popover-layer" role="presentation">
      <button
        type="button"
        className="family-tree-popover-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="family-tree-popover"
      >
        <div className="flex items-start gap-3">
          <span className="family-tree-popover-avatar">
            {cover?.previewUrl ? (
              <PersonAvatar
                previewUrl={cover.previewUrl}
                boundingBox={cover.boundingBox}
                framing={cover.framing}
                alt=""
                className="size-full"
              />
            ) : (
              <span className="family-tree-person-initials" aria-hidden>
                {treeNodeInitials(node.label)}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="font-display text-xl tracking-tight text-ink"
            >
              {node.person?.displayName ?? node.label}
            </h2>
            <p className="text-sm text-ink-muted">
              {node.isPlaceholder
                ? "Temporary label — link a Person from your vault when you have a photo."
                : "Same Person as in People · face stays private to your account"}
            </p>
            {peopleHref ? (
              <Link
                href={peopleHref}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-deep underline-offset-2 hover:underline"
              >
                Open in People
                <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {node.needsReview ? (
          <div
            className="mt-4 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5 text-sm text-ink"
            role="status"
          >
            <p className="font-medium text-accent-deep">Needs review</p>
            <p className="mt-1 text-ink-muted">
              {node.reviewReason ??
                "We weren’t sure how to fix this connection automatically."}
            </p>
            {onClearReview ? (
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm mt-2"
                disabled={pending}
                onClick={() => onClearReview(node.id)}
              >
                Mark as reviewed
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5">
          <p className="text-sm font-medium text-ink">Grow from here</p>
          <p className="mt-1 text-xs text-ink-muted">
            Add a parent, partner, child, or brother/sister. Other relatives are
            created through those links.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="family-tree-shortcut"
              disabled={pending}
              onClick={() => onAddParent(node.id)}
            >
              <UserPlus className="size-4" aria-hidden />
              Add parent
            </button>
            <button
              type="button"
              className="family-tree-shortcut"
              disabled={pending}
              onClick={() => onAddChild(node.id)}
            >
              <Baby className="size-4" aria-hidden />
              Add child
            </button>
            <button
              type="button"
              className="family-tree-shortcut"
              disabled={pending}
              onClick={() => onAddPartner(node.id)}
            >
              <Heart className="size-4" aria-hidden />
              Add spouse / partner
            </button>
            <button
              type="button"
              className="family-tree-shortcut"
              disabled={pending}
              onClick={() => onAddSibling(node.id)}
            >
              <Users className="size-4" aria-hidden />
              Add sibling
            </button>
          </div>
        </div>

        <label className="mt-5 block text-sm">
          <span className="mb-1 block text-ink-muted">Name on the tree</span>
          <input
            className="ui-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            disabled={pending}
          />
        </label>
        <button
          type="button"
          className="ui-btn ui-btn-secondary ui-btn-sm mt-2"
          disabled={pending || !label.trim() || label.trim() === node.label}
          onClick={() => onRename(node.id, label.trim())}
        >
          Save name
        </button>

        <div className="mt-5 border-t border-ink/8 pt-4">
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
            <Link2 className="size-3.5" aria-hidden />
            {node.isPlaceholder ? "Link a Person from your vault" : "People link"}
          </p>
          {node.personId ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {peopleHref ? (
                <Link
                  href={peopleHref}
                  className="ui-btn ui-btn-secondary ui-btn-sm"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  View photos & details
                </Link>
              ) : null}
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-sm"
                disabled={pending}
                onClick={() => onLinkPerson(node.id, null)}
              >
                Unlink Person (keep label only)
              </button>
            </div>
          ) : availablePeople.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">
              No unused People left to link. Upload photos so faces appear in
              People, then connect them here — the tree does not create a second
              identity.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                className="ui-input"
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search your People…"
                disabled={pending}
              />
              <ul className="family-tree-link-list">
                {linkMatches.slice(0, 8).map((person) => {
                  const pCover = coverByPersonId.get(person.id);
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        className={cn(
                          "family-tree-unplaced-item",
                          linkPersonId === person.id &&
                            "family-tree-unplaced-item--selected",
                        )}
                        disabled={pending}
                        onClick={() => setLinkPersonId(person.id)}
                      >
                        <span className="family-tree-unplaced-avatar">
                          {pCover?.previewUrl ? (
                            <PersonAvatar
                              previewUrl={pCover.previewUrl}
                              boundingBox={pCover.boundingBox}
                              framing={pCover.framing}
                              alt=""
                              className="size-full"
                            />
                          ) : (
                            <span
                              className="family-tree-person-initials text-sm"
                              aria-hidden
                            >
                              {treeNodeInitials(person.displayName)}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-left font-medium">
                          {person.displayName}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm"
                disabled={pending || !linkPersonId}
                onClick={() => onLinkPerson(node.id, linkPersonId)}
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Link2 className="size-3.5" aria-hidden />
                )}
                Link this Person
              </button>
            </div>
          )}
        </div>

        {nodeRels.length > 0 ? (
          <div className="mt-5 border-t border-ink/8 pt-4">
            <p className="text-sm font-medium text-ink">Connections</p>
            <ul className="mt-2 space-y-1.5">
              {nodeRels.map((rel) => {
                if (!isFamilyTreeRelationType(rel.type)) return null;
                const otherId =
                  rel.fromNodeId === node.id ? rel.toNodeId : rel.fromNodeId;
                const other = nodeById.get(otherId);
                const otherName =
                  other?.person?.displayName ?? other?.label ?? "Someone";
                const phrase = describeRelationFromViewer(
                  rel.type,
                  rel.fromNodeId === node.id,
                );
                return (
                  <li
                    key={rel.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-ink/8 px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate text-ink">
                      <span className="font-medium">{phrase}</span>{" "}
                      <span className="text-ink-muted">{otherName}</span>
                    </span>
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-sm shrink-0 text-red-700"
                      disabled={pending}
                      onClick={() => onRemoveRelationship(rel.id)}
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {others.length > 0 ? (
          <div className="mt-5 border-t border-ink/8 pt-4">
            <p className="text-sm font-medium text-ink">
              Connect to someone already on the tree
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-ink-muted">With</span>
                <select
                  className="ui-input"
                  value={relOtherId}
                  onChange={(e) => setRelOtherId(e.target.value)}
                  disabled={pending}
                >
                  <option value="">Choose…</option>
                  {others.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.person?.displayName ?? n.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-ink-muted">
                  {node.person?.displayName ?? node.label}…
                </span>
                <select
                  className="ui-input"
                  value={relChoice}
                  onChange={(e) =>
                    setRelChoice(e.target.value as FamilyTreeRelationChoiceId)
                  }
                  disabled={pending}
                >
                  {FAMILY_TREE_RELATION_CHOICES.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label.replace("…", "")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="ui-btn ui-btn-secondary ui-btn-sm mt-2"
              disabled={pending || connecting || !relOtherId}
              onClick={() => {
                if (!relOtherId) return;
                const resolved = resolveRelationChoice(
                  relChoice,
                  node.id,
                  relOtherId,
                );
                void (async () => {
                  setConnectError(null);
                  setConnecting(true);
                  try {
                    await onAddRelationship(
                      resolved.fromNodeId,
                      resolved.toNodeId,
                      resolved.type,
                    );
                    // Parent clears selection on success; close as a fallback.
                    onClose();
                  } catch (err) {
                    setConnectError(
                      err instanceof Error
                        ? err.message
                        : "Could not save that connection.",
                    );
                  } finally {
                    setConnecting(false);
                  }
                })();
              }}
            >
              {connecting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : null}
              Save connection
            </button>
            {connectError ? (
              <p
                className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-800"
                role="alert"
              >
                {connectError}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-ink/8 pt-4">
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm text-red-700 hover:bg-red-50"
            disabled={pending}
            onClick={() => onRemove(node.id)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remove from tree
          </button>
        </div>
      </div>
    </div>
  );
}
