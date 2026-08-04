"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { LegacySectionVideos } from "@/components/legacy/LegacySectionVideos";
import type {
  SerializedLegacyDocumentOption,
  SerializedLegacyInstruction,
  SerializedLegacyVideo,
} from "@/lib/legacy/serialize";
import type { LegacyInstructionHint } from "@/lib/legacy/nav";
import { LEGACY_BUSINESS_VIDEO_STARTERS } from "@/lib/legacy/nav";
import type { LegacyVideoSectionType } from "@/lib/legacy/types";

type LegacyInstructionsPanelProps = {
  title: string;
  lead: string;
  hints: LegacyInstructionHint[];
  instructions: SerializedLegacyInstruction[];
  documentOptions: SerializedLegacyDocumentOption[];
  /** Videos for sections on this page (filtered client-side per hint). */
  videos?: SerializedLegacyVideo[];
  /** Allow in-browser recording in each section. Default false on instruction pages. */
  allowRecordVideos?: boolean;
  /**
   * "operations" enables Business Continuity walkthrough UX:
   * numbered order, starter titles, written summaries.
   */
  videoIntent?: "default" | "operations";
};

type InstructionDraft = {
  sectionType: LegacyInstructionHint["sectionType"];
  title: string;
  content: string;
  documentIds: string[];
};

export function LegacyInstructionsPanel({
  title,
  lead,
  hints,
  instructions: initial,
  documentOptions,
  videos = [],
  allowRecordVideos = false,
  videoIntent = "default",
}: LegacyInstructionsPanelProps) {
  const router = useRouter();
  const sectionTypes = useMemo(
    () => new Set(hints.map((h) => h.sectionType)),
    [hints],
  );
  const [instructions, setInstructions] = useState(
    initial.filter((i) => sectionTypes.has(i.sectionType)),
  );
  const [addingFor, setAddingFor] = useState<
    LegacyInstructionHint["sectionType"] | null
  >(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstructionDraft | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function hintFor(sectionType: LegacyInstructionHint["sectionType"]) {
    return hints.find((h) => h.sectionType === sectionType)!;
  }

  function startAdd(
    sectionType: LegacyInstructionHint["sectionType"],
    starter?: { title: string; content: string },
  ) {
    const hint = hintFor(sectionType);
    setEditingId(null);
    setAddingFor(sectionType);
    setDraft({
      sectionType,
      title: starter?.title ?? hint.defaultBlockTitle,
      content: starter?.content ?? "",
      documentIds: [],
    });
  }

  function startEdit(instruction: SerializedLegacyInstruction) {
    setAddingFor(null);
    setEditingId(instruction.id);
    setDraft({
      sectionType: instruction.sectionType,
      title: instruction.title,
      content: instruction.content,
      documentIds: instruction.attachedDocuments.map((doc) => doc.id),
    });
  }

  function cancelDraft() {
    setAddingFor(null);
    setDraft(null);
    setEditingId(null);
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;

    setError(null);

    try {
      if (editingId) {
        const res = await fetch(`/api/legacy/instructions/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title.trim(),
            content: draft.content.trim(),
            documentIds: draft.documentIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not save.");
        setInstructions((prev) =>
          prev.map((i) => (i.id === editingId ? data.instruction : i)),
        );
      } else {
        const res = await fetch("/api/legacy/instructions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionType: draft.sectionType,
            title: draft.title.trim(),
            content: draft.content.trim(),
            documentIds: draft.documentIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not save.");
        setInstructions((prev) => [...prev, data.instruction]);
      }
      cancelDraft();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function deleteInstruction(instruction: SerializedLegacyInstruction) {
    if (!window.confirm(`Remove “${instruction.title}”?`)) return;
    setBusyId(instruction.id);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/instructions/${instruction.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not remove.");
      setInstructions((prev) => prev.filter((i) => i.id !== instruction.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {lead}
        </p>

        {error ? (
          <p className="mt-4 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 space-y-8">
          {hints.map((hint) => {
            const sectionItems = instructions.filter(
              (i) => i.sectionType === hint.sectionType,
            );
            const isAddingHere = addingFor === hint.sectionType;

            return (
              <div key={hint.sectionType}>
                <h3 className="font-display text-lg tracking-tight text-[color:var(--legacy-ink)]">
                  {hint.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
                  {hint.description}
                </p>

                {sectionItems.length ? (
                  <ul className="mt-4 space-y-3">
                    {sectionItems.map((instruction) => (
                      <li
                        key={instruction.id}
                        className="rounded-xl border border-[color:var(--legacy-line)] bg-white/50 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-[color:var(--legacy-ink)]">
                              {instruction.title}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--legacy-muted)]">
                              {instruction.content}
                            </p>
                            {instruction.attachedDocuments.length ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {instruction.attachedDocuments.map((document) => (
                                  <span
                                    key={document.id}
                                    className="rounded-full border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1 text-xs text-[color:var(--legacy-muted)]"
                                  >
                                    Attached: {document.title}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(instruction)}
                              disabled={editingId === instruction.id}
                              className="rounded-md border border-[color:var(--legacy-line)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)]"
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteInstruction(instruction)}
                              disabled={busyId === instruction.id}
                              className="rounded-md border border-red-800/20 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-[color:var(--legacy-muted)]">
                    Nothing added here yet. You can write a note from scratch or
                    start with one of the suggested blocks below.
                  </p>
                )}

                {hint.starterBlocks?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hint.starterBlocks.map((starter) => (
                      <button
                        key={starter.title}
                        type="button"
                        onClick={() => startAdd(hint.sectionType, starter)}
                        className="rounded-full border border-[color:var(--legacy-line)] bg-white/60 px-3 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
                      >
                        Start: {starter.title}
                      </button>
                    ))}
                  </div>
                ) : null}

                {isAddingHere && draft ? (
                  <form
                    onSubmit={saveDraft}
                    className="mt-4 space-y-3 rounded-xl border border-[color:var(--legacy-line)] bg-white/60 p-4"
                  >
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                        Title
                      </span>
                      <input
                        value={draft.title}
                        onChange={(e) =>
                          setDraft({ ...draft, title: e.target.value })
                        }
                        required
                        maxLength={200}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                        Instructions
                      </span>
                      <textarea
                        value={draft.content}
                        onChange={(e) =>
                          setDraft({ ...draft, content: e.target.value })
                        }
                        required
                        rows={6}
                        maxLength={50000}
                        placeholder={hint.placeholder}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                        Attach related private documents
                      </span>
                      <select
                        multiple
                        value={draft.documentIds}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            documentIds: Array.from(e.target.selectedOptions).map(
                              (option) => option.value,
                            ),
                          })
                        }
                        className="mt-1.5 min-h-28 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                      >
                        {documentOptions.map((document) => (
                          <option key={document.id} value={document.id}>
                            {document.title}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-[color:var(--legacy-muted)]">
                        Optional. Hold Ctrl or Cmd to choose more than one.
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="inline-flex rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelDraft}
                        className="inline-flex rounded-md border border-[color:var(--legacy-line)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : editingId &&
                  draft &&
                  sectionItems.some((i) => i.id === editingId) ? (
                  <form
                    onSubmit={saveDraft}
                    className="mt-4 space-y-3 rounded-xl border border-[color:var(--legacy-line)] bg-white/60 p-4"
                  >
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                        Title
                      </span>
                      <input
                        value={draft.title}
                        onChange={(e) =>
                          setDraft({ ...draft, title: e.target.value })
                        }
                        required
                        maxLength={200}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                        Instructions
                      </span>
                      <textarea
                        value={draft.content}
                        onChange={(e) =>
                          setDraft({ ...draft, content: e.target.value })
                        }
                        required
                        rows={6}
                        maxLength={50000}
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                        Attach related private documents
                      </span>
                      <select
                        multiple
                        value={draft.documentIds}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            documentIds: Array.from(e.target.selectedOptions).map(
                              (option) => option.value,
                            ),
                          })
                        }
                        className="mt-1.5 min-h-28 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                      >
                        {documentOptions.map((document) => (
                          <option key={document.id} value={document.id}>
                            {document.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        className="inline-flex rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)]"
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        onClick={cancelDraft}
                        className="inline-flex rounded-md border border-[color:var(--legacy-line)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => startAdd(hint.sectionType)}
                    className="mt-3 inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3 py-2 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
                  >
                    <Plus className="size-4" aria-hidden />
                    Add written note
                  </button>
                )}

                <LegacySectionVideos
                  sectionType={hint.sectionType as LegacyVideoSectionType}
                  initialVideos={videos}
                  allowRecord={allowRecordVideos}
                  compact
                  intent={videoIntent}
                  suggestedTitles={
                    videoIntent === "operations"
                      ? LEGACY_BUSINESS_VIDEO_STARTERS[hint.sectionType] ?? []
                      : []
                  }
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
