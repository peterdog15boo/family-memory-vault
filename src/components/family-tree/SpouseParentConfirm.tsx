"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Heart, X } from "lucide-react";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";
import { childIdsOf } from "@/lib/family-tree/genealogy-iq";
import { cn } from "@/lib/utils";

export type SpouseParentConfirmSubmit = {
  personId: string;
  label: string;
  /** Children the new spouse should NOT become parent of. */
  excludeChildIds: string[];
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
 * When adding a spouse to someone who already has children, ask which kids
 * the new spouse also parents (default: yes). Uncheck for step-family.
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
  const [alsoParentByChild, setAlsoParentByChild] = useState<
    Record<string, boolean>
  >({});

  const children = useMemo(() => {
    if (!personId) return [];
    const edges = tree.relationships.map((r) => ({
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type,
    }));
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
  }, [personId, tree.nodes, tree.relationships]);

  useEffect(() => {
    if (!open) return;
    setSpouseLabel("");
    const next: Record<string, boolean> = {};
    for (const child of children) {
      next[child.id] = true;
    }
    setAlsoParentByChild(next);
  }, [open, personId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on open only

  if (!open || !person || children.length === 0) return null;

  const spouseName = spouseLabel.trim() || "Spouse";
  const personName = person.person?.displayName ?? person.label;

  async function finish() {
    if (!personId) return;
    const excludeChildIds = children
      .filter((c) => alsoParentByChild[c.id] === false)
      .map((c) => c.id);
    await onSubmit({
      personId,
      label: spouseName,
      excludeChildIds,
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
              Add spouse of {personName}
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-ink">
              Parent of existing children?
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
            <span className="mb-1 block text-ink-muted">Spouse’s name</span>
            <input
              className="ui-input"
              value={spouseLabel}
              onChange={(e) => setSpouseLabel(e.target.value)}
              placeholder="Spouse"
              maxLength={120}
              autoFocus
              disabled={pending}
            />
          </label>

          <p className="text-sm text-ink">
            Is {spouseName === "Spouse" ? "the new spouse" : spouseName} also a
            parent of these children?
          </p>

          <ul className="space-y-2">
            {children.map((child) => {
              const checked = alsoParentByChild[child.id] !== false;
              return (
                <li key={child.id}>
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
                        setAlsoParentByChild((prev) => ({
                          ...prev,
                          [child.id]: e.target.checked,
                        }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      {checked ? (
                        <span className="text-ink">
                          Yes, also a parent of {child.label}
                        </span>
                      ) : (
                        <span className="text-ink">
                          No — {child.label} is only {personName}’s child
                          (step-family)
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-ink-muted">
            Leave checked for a shared first family. Uncheck for remarriage /
            step-parent.
          </p>
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
            <Heart className="size-3.5" aria-hidden />
            Add spouse
          </button>
        </div>
      </div>
    </div>
  );
}
