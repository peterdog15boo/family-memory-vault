"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Heart, X } from "lucide-react";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";
import { childIdsOf, spouseIdsOf } from "@/lib/family-tree/genealogy-iq";
import { cn } from "@/lib/utils";

export type SpouseParentConfirmSubmit = {
  personId: string;
  label: string;
  /** Children the new spouse should NOT become parent of. */
  excludeChildIds: string[];
  partnerStatus: "current" | "former";
};

type Props = {
  open: boolean;
  personId: string | null;
  tree: SerializedFamilyTreeGraph;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: SpouseParentConfirmSubmit) => void | Promise<void>;
};

/**
 * Add spouse / another partner: status (current|former) + which children
 * this union shares (default: none when the person already has a partner).
 */
export function SpouseParentConfirm({
  open,
  personId,
  tree,
  pending,
  onClose,
  onSubmit,
}: Props) {
  const titleId = useId();
  const person = tree.nodes.find((n) => n.id === personId) ?? null;
  const [spouseLabel, setSpouseLabel] = useState("");
  const [partnerStatus, setPartnerStatus] = useState<"current" | "former">(
    "current",
  );
  const [alsoParentByChild, setAlsoParentByChild] = useState<
    Record<string, boolean>
  >({});

  const edges = useMemo(
    () =>
      tree.relationships.map((r) => ({
        fromNodeId: r.fromNodeId,
        toNodeId: r.toNodeId,
        type: r.type,
      })),
    [tree.relationships],
  );

  const existingPartnerCount = personId
    ? spouseIdsOf(edges, personId).length
    : 0;
  const addingAnother = existingPartnerCount > 0;

  const children = useMemo(() => {
    if (!personId) return [];
    const ids = childIdsOf(edges, personId);
    const byId = new Map(tree.nodes.map((n) => [n.id, n]));
    return ids
      .map((id) => {
        const node = byId.get(id);
        if (!node) return null;
        return {
          id,
          label: node.person?.displayName ?? node.label,
        };
      })
      .filter((c): c is { id: string; label: string } => Boolean(c));
  }, [personId, tree.nodes, edges]);

  useEffect(() => {
    if (!open) return;
    setSpouseLabel("");
    setPartnerStatus(addingAnother ? "former" : "current");
    const next: Record<string, boolean> = {};
    for (const child of children) {
      // Additional partners do not auto-share kids (Dana ≠ Duane Jr’s parent).
      next[child.id] = !addingAnother;
    }
    setAlsoParentByChild(next);
  }, [open, personId, addingAnother]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on open

  if (!open || !person) return null;

  const spouseName = spouseLabel.trim() || "Partner";
  const personName = person.person?.displayName ?? person.label;

  async function finish() {
    if (!personId) return;
    const excludeChildIds = children
      .filter((c) => alsoParentByChild[c.id] !== true)
      .map((c) => c.id);
    await onSubmit({
      personId,
      label: spouseName,
      excludeChildIds,
      partnerStatus,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-3 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="family-tree-popover w-full max-w-md rounded-2xl border border-ink/10 bg-canvas p-4 shadow-xl sm:p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-deep">
              <Heart className="size-3.5" aria-hidden />
              {addingAnother ? "Add another partner" : "Add partner"}
            </p>
            <h2
              id={titleId}
              className="mt-1 font-display text-xl tracking-tight text-ink"
            >
              Partner of {personName}
            </h2>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm shrink-0"
            disabled={pending}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium text-ink">Name</span>
          <input
            className="ui-input"
            value={spouseLabel}
            onChange={(e) => setSpouseLabel(e.target.value)}
            placeholder="Partner’s name"
            maxLength={120}
            disabled={pending}
            autoFocus
          />
        </label>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-ink">Status</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["current", "Current"],
                ["former", "Former"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "family-tree-rel-choice",
                  partnerStatus === value && "family-tree-rel-choice--active",
                )}
                disabled={pending}
                onClick={() => setPartnerStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            Former shows a small “former” hint on the tree (divorced / separated).
          </p>
        </fieldset>

        {children.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">
              Do they share children with {personName}?
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Unchecked children stay on the other union only
              {addingAnother ? " (default for another partner)" : ""}.
            </p>
            <ul className="mt-2 space-y-2">
              {children.map((child) => {
                const checked = alsoParentByChild[child.id] === true;
                return (
                  <li key={child.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-ink/20"
                        checked={checked}
                        disabled={pending}
                        onChange={(e) =>
                          setAlsoParentByChild((prev) => ({
                            ...prev,
                            [child.id]: e.target.checked,
                          }))
                        }
                      />
                      <span>{child.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary ui-btn-sm"
            disabled={pending || !spouseLabel.trim()}
            onClick={() => void finish()}
          >
            {pending ? "Saving…" : "Add partner"}
          </button>
        </div>
      </div>
    </div>
  );
}
