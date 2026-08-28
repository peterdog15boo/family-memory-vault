"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Baby, X } from "lucide-react";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";
import { spouseIdsOf } from "@/lib/family-tree/genealogy-iq";
import { cn } from "@/lib/utils";

export type ChildParentsConfirmSubmit = {
  personId: string;
  label: string;
  /** Spouse node ids that should also get parent_of → child. */
  coParentSpouseIds: string[];
};

type Props = {
  open: boolean;
  personId: string | null;
  tree: SerializedFamilyTreeGraph;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: ChildParentsConfirmSubmit) => void | Promise<void>;
};

/**
 * When adding a child from someone who has a spouse, ask which adults are
 * parents. Starter is always included; spouses default on (uncheck for
 * step-child / prior relationship).
 */
export function ChildParentsConfirm({
  open,
  personId,
  tree,
  pending,
  onClose,
  onSubmit,
}: Props) {
  const titleId = useId();
  const person = tree.nodes.find((n) => n.id === personId) ?? null;
  const [childLabel, setChildLabel] = useState("");
  const [spouseChecked, setSpouseChecked] = useState<Record<string, boolean>>(
    {},
  );

  const spouses = useMemo(() => {
    if (!personId) return [];
    const edges = tree.relationships.map((r) => ({
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type,
    }));
    const ids = spouseIdsOf(edges, personId);
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
      .filter((s): s is { id: string; label: string } => Boolean(s));
  }, [personId, tree.nodes, tree.relationships]);

  useEffect(() => {
    if (!open) return;
    setChildLabel("");
    const next: Record<string, boolean> = {};
    for (const spouse of spouses) {
      next[spouse.id] = true;
    }
    setSpouseChecked(next);
  }, [open, personId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on open only

  if (!open || !person || spouses.length === 0) return null;

  const personName = person.person?.displayName ?? person.label;
  const childName = childLabel.trim() || "this child";

  async function finish() {
    if (!personId) return;
    const coParentSpouseIds = spouses
      .filter((s) => spouseChecked[s.id] !== false)
      .map((s) => s.id);
    await onSubmit({
      personId,
      label: childLabel.trim() || "Child",
      coParentSpouseIds,
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-ink/10 bg-paper p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Add child of {personName}
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-ink">
              Who are the parents?
            </h2>
          </div>
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm"
            aria-label="Cancel"
            disabled={pending}
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-muted">Child’s name</span>
            <input
              className="ui-input"
              value={childLabel}
              onChange={(e) => setChildLabel(e.target.value)}
              placeholder="Child"
              maxLength={120}
              autoFocus
              disabled={pending}
            />
          </label>

          <p className="text-sm text-ink">
            Who are the parents of {childName}?
          </p>

          <ul className="space-y-2">
            <li>
              <label
                className={cn(
                  "flex cursor-not-allowed items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5 text-sm",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                  checked
                  disabled
                  readOnly
                />
                <span className="min-w-0 flex-1 text-ink">
                  {personName}
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    Required — you started Add child from here
                  </span>
                </span>
              </label>
            </li>
            {spouses.map((spouse) => {
              const checked = spouseChecked[spouse.id] !== false;
              return (
                <li key={spouse.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm",
                      checked
                        ? "border-accent/30 bg-accent/5"
                        : "border-ink/10 bg-canvas/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--accent)]"
                      checked={checked}
                      disabled={pending}
                      onChange={(e) =>
                        setSpouseChecked((prev) => ({
                          ...prev,
                          [spouse.id]: e.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0 flex-1 text-ink">
                      {spouse.label}
                      {!checked ? (
                        <span className="mt-0.5 block text-xs text-ink-muted">
                          Step-child / child from a prior relationship
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-5 flex justify-end gap-2">
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
            disabled={pending}
            onClick={() => void finish()}
          >
            <Baby className="size-3.5" aria-hidden />
            Add child
          </button>
        </div>
      </div>
    </div>
  );
}
