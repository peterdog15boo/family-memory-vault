"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, Users, X } from "lucide-react";
import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";
import {
  listCousinAttachCandidates,
  type CousinAttachWhich,
} from "@/lib/family-tree/cousin-wizard";
import { cn } from "@/lib/utils";

export type CousinWizardSubmit = {
  personId: string;
  label: string;
  cousinPeopleId: string | null;
  parent1Label: string;
  parent2Label: string;
  attachWhich: CousinAttachWhich;
  attachToNodeId: string;
};

type Props = {
  open: boolean;
  subjectId: string | null;
  tree: SerializedFamilyTreeGraph;
  availablePeople: Array<{ id: string; displayName: string }>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: CousinWizardSubmit) => void | Promise<void>;
};

/**
 * 3-step Add Cousin wizard — cousin is never saved without named Parent 1
 * and an attachment on the subject’s family side.
 */
export function CousinAddWizard({
  open,
  subjectId,
  tree,
  availablePeople,
  pending,
  onClose,
  onSubmit,
}: Props) {
  const titleId = useId();
  const subject = tree.nodes.find((n) => n.id === subjectId) ?? null;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cousinName, setCousinName] = useState("");
  const [peopleId, setPeopleId] = useState<string | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [parent1, setParent1] = useState("");
  const [parent2, setParent2] = useState("");
  const [attachWhich, setAttachWhich] = useState<CousinAttachWhich>("parent1");
  const [attachToNodeId, setAttachToNodeId] = useState("");

  const candidates = useMemo(() => {
    if (!subjectId) return [];
    return listCousinAttachCandidates(
      {
        nodes: tree.nodes.map((n) => ({ id: n.id, label: n.label })),
        relationships: tree.relationships.map((r) => ({
          fromNodeId: r.fromNodeId,
          toNodeId: r.toNodeId,
          type: r.type,
        })),
      },
      subjectId,
    );
  }, [subjectId, tree.nodes, tree.relationships]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setCousinName("");
    setPeopleId(null);
    setPeopleQuery("");
    setParent1("");
    setParent2("");
    setAttachWhich("parent1");
    setAttachToNodeId(candidates[0]?.id ?? "");
  }, [open, subjectId]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on open only

  useEffect(() => {
    if (!attachToNodeId && candidates[0]) {
      setAttachToNodeId(candidates[0].id);
    }
  }, [candidates, attachToNodeId]);

  if (!open || !subject) return null;

  const peopleMatches = availablePeople.filter((p) =>
    p.displayName.toLowerCase().includes(peopleQuery.trim().toLowerCase()),
  );

  const canNext1 = cousinName.trim().length > 0;
  const canNext2 = parent1.trim().length > 0;
  const canFinish =
    canNext1 &&
    canNext2 &&
    Boolean(attachToNodeId) &&
    (attachWhich !== "parent2" || parent2.trim().length > 0);

  async function finish() {
    if (!subjectId || !canFinish) return;
    await onSubmit({
      personId: subjectId,
      label: cousinName.trim(),
      cousinPeopleId: peopleId,
      parent1Label: parent1.trim(),
      parent2Label: parent2.trim(),
      attachWhich,
      attachToNodeId,
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
              Add cousin of {subject.label}
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-ink">
              Step {step} of 3
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

        <div className="mt-4 flex gap-1.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                n <= step ? "bg-accent" : "bg-ink/10",
              )}
            />
          ))}
        </div>

        {step === 1 ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-ink-muted">Who is the cousin?</p>
            <label className="block text-sm">
              <span className="mb-1 block text-ink-muted">Name (required)</span>
              <input
                className="ui-input"
                value={cousinName}
                onChange={(e) => setCousinName(e.target.value)}
                maxLength={120}
                autoFocus
                disabled={pending}
              />
            </label>
            <div>
              <p className="mb-1 text-sm text-ink-muted">
                Optional People link
              </p>
              <input
                className="ui-input"
                value={peopleQuery}
                onChange={(e) => setPeopleQuery(e.target.value)}
                placeholder="Search your People…"
                disabled={pending}
              />
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                {peopleMatches.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={cn(
                        "family-tree-unplaced-item w-full",
                        peopleId === p.id &&
                          "family-tree-unplaced-item--selected",
                      )}
                      disabled={pending}
                      onClick={() => {
                        setPeopleId(p.id);
                        if (!cousinName.trim()) setCousinName(p.displayName);
                      }}
                    >
                      <span className="truncate font-medium">
                        {p.displayName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {peopleId ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-ghost ui-btn-sm mt-1"
                  disabled={pending}
                  onClick={() => setPeopleId(null)}
                >
                  Clear People link
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-ink-muted">
              Who are {cousinName.trim() || "the cousin"}’s parents?
            </p>
            <label className="block text-sm">
              <span className="mb-1 block text-ink-muted">
                Parent 1 name (required)
              </span>
              <input
                className="ui-input"
                value={parent1}
                onChange={(e) => setParent1(e.target.value)}
                maxLength={120}
                autoFocus
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink-muted">
                Parent 2 name (optional, encouraged)
              </span>
              <input
                className="ui-input"
                value={parent2}
                onChange={(e) => setParent2(e.target.value)}
                maxLength={120}
                disabled={pending}
              />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-medium text-ink">
              Which parent is related to this family?
            </p>
            {candidates.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Add parents for {subject.label} first so we know which side to
                attach on.
              </p>
            ) : (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-ink-muted">
                    Related to…
                  </span>
                  <select
                    className="ui-input"
                    value={attachToNodeId}
                    onChange={(e) => setAttachToNodeId(e.target.value)}
                    disabled={pending}
                  >
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                        {c.kind === "parent" ? " (parent)" : " (aunt/uncle)"}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="space-y-2">
                  <legend className="sr-only">Which parent attaches</legend>
                  {(
                    [
                      {
                        value: "parent1" as const,
                        label: `${parent1.trim() || "Parent 1"} is a sibling of ${
                          candidates.find((c) => c.id === attachToNodeId)
                            ?.label ?? "this relative"
                        }`,
                      },
                      {
                        value: "parent2" as const,
                        label: `${parent2.trim() || "Parent 2"} is a sibling of ${
                          candidates.find((c) => c.id === attachToNodeId)
                            ?.label ?? "this relative"
                        }`,
                        disabled: !parent2.trim(),
                      },
                      {
                        value: "unsure" as const,
                        label:
                          "Not sure yet (still create named parents; mark sibling link unverified)",
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm",
                        attachWhich === opt.value && "border-accent bg-accent/5",
                        "disabled" in opt &&
                          opt.disabled &&
                          "cursor-not-allowed opacity-50",
                      )}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        name="attachWhich"
                        checked={attachWhich === opt.value}
                        disabled={
                          pending ||
                          ("disabled" in opt ? Boolean(opt.disabled) : false)
                        }
                        onChange={() => setAttachWhich(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </fieldset>
              </>
            )}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm"
            disabled={pending || step === 1}
            onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)))}
          >
            Back
          </button>
          <div className="flex gap-2">
            {step < 3 ? (
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm"
                disabled={
                  pending || (step === 1 ? !canNext1 : !canNext2)
                }
                onClick={() =>
                  setStep((s) => (s === 3 ? 3 : ((s + 1) as 1 | 2 | 3)))
                }
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm"
                disabled={pending || !canFinish || candidates.length === 0}
                onClick={() => void finish()}
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Users className="size-3.5" aria-hidden />
                )}
                Add cousin
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
