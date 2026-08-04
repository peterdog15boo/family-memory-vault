"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, EyeOff, Plus, Trash2 } from "lucide-react";
import { COPY } from "@/lib/copy";
import type {
  SerializedLegacyDocumentOption,
  SerializedLegacySecureItem,
} from "@/lib/legacy/serialize";
import {
  LEGACY_SECURE_ITEM_TYPE_LABELS,
  type LegacySecureItemType,
} from "@/lib/legacy/types";

type LegacySecureItemsPanelProps = {
  secureItems: SerializedLegacySecureItem[];
  documentOptions: SerializedLegacyDocumentOption[];
};

type SecureDraft = {
  label: string;
  itemType: LegacySecureItemType;
  content: string;
  relatedDocumentId: string;
  notes: string;
};

const SECURE_ITEM_TYPES = Object.keys(
  LEGACY_SECURE_ITEM_TYPE_LABELS,
) as LegacySecureItemType[];

const EMPTY_DRAFT: SecureDraft = {
  label: "",
  itemType: "account_info",
  content: "",
  relatedDocumentId: "",
  notes: "",
};

export function LegacySecureItemsPanel({
  secureItems: initial,
  documentOptions,
}: LegacySecureItemsPanelProps) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<SecureDraft>(EMPTY_DRAFT);
  const [revealedById, setRevealedById] = useState<
    Record<string, SerializedLegacySecureItem>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleReveal(item: SerializedLegacySecureItem) {
    if (revealedById[item.id]) {
      setRevealedById((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    if (!window.confirm(COPY.legacy.secureRevealConfirm)) return;

    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/secure-items/${item.id}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not reveal this item.");
      }
      setRevealedById((prev) => ({
        ...prev,
        [item.id]: data.secureItem,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reveal this item.");
    } finally {
      setBusyId(null);
    }
  }

  async function createItem(event: React.FormEvent) {
    event.preventDefault();
    setFormBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/legacy/secure-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label.trim(),
          itemType: draft.itemType,
          content: draft.content.trim(),
          relatedDocumentId: draft.relatedDocumentId.trim() || null,
          notes: draft.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save secure item.");
      setItems((prev) => [...prev, data.secureItem]);
      setRevealedById((prev) => ({
        ...prev,
        [data.secureItem.id]: data.secureItem,
      }));
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save secure item.",
      );
    } finally {
      setFormBusy(false);
    }
  }

  async function deleteItem(item: SerializedLegacySecureItem) {
    if (!window.confirm(`Remove “${item.label}”?`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/secure-items/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not remove.");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div
        className="legacy-vault-in flex gap-3 rounded-2xl border border-amber-800/20 bg-amber-50/80 px-4 py-4 text-sm leading-relaxed text-amber-950"
        role="note"
      >
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-800" aria-hidden />
        <div>
          <p className="font-medium">{COPY.legacy.secureWarning}</p>
          <p className="mt-1 text-amber-900/80">{COPY.legacy.secureWarningShort}</p>
        </div>
      </div>

      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          Secure Items
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          Passwords, account details, and access notes. Content stays hidden until
          you choose to reveal it.
        </p>

        {error ? (
          <p className="mt-4 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        {items.length ? (
          <ul className="mt-5 space-y-3">
            {items.map((item) => {
              const revealed = revealedById[item.id];
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-[color:var(--legacy-line)] bg-white/50 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-[color:var(--legacy-ink)]">
                          {item.label}
                        </p>
                        <span className="rounded-full border border-[color:var(--legacy-line)] px-2 py-0.5 text-[11px] text-[color:var(--legacy-muted)]">
                          {LEGACY_SECURE_ITEM_TYPE_LABELS[item.itemType]}
                        </span>
                      </div>
                      {item.relatedDocumentTitle ? (
                        <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
                          Linked document:{" "}
                          <Link
                            href={`/documents/${item.relatedDocumentId}`}
                            className="font-medium text-[color:var(--legacy-accent-deep)] hover:underline"
                          >
                            {item.relatedDocumentTitle}
                          </Link>
                        </p>
                      ) : null}
                      <div className="mt-3">
                        {revealed?.content ? (
                          <p className="whitespace-pre-wrap rounded-lg border border-amber-800/15 bg-amber-50/50 px-3 py-2 text-sm leading-relaxed text-[color:var(--legacy-ink)]">
                            {revealed.content}
                          </p>
                        ) : (
                          <p className="flex items-center gap-2 text-sm text-[color:var(--legacy-muted)]">
                            <EyeOff className="size-4" aria-hidden />
                            Sensitive content hidden
                          </p>
                        )}
                      </div>
                      {revealed?.notes ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--legacy-muted)]">
                          {revealed.notes}
                        </p>
                      ) : item.notesRedacted ? (
                        <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
                          Additional notes hidden
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => toggleReveal(item)}
                        disabled={busyId === item.id}
                        className="rounded-md border border-[color:var(--legacy-line)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                      >
                        {revealed ? "Hide" : "Reveal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteItem(item)}
                        disabled={busyId === item.id}
                        className="rounded-md border border-red-800/20 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-5 text-sm text-[color:var(--legacy-muted)]">
            No secure items yet. Add only what would truly help someone you trust.
          </p>
        )}

        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            <Plus className="size-4" aria-hidden />
            Add secure item
          </button>
        ) : (
          <form
            onSubmit={createItem}
            className="mt-5 space-y-3 border-t border-[color:var(--legacy-line)] pt-5"
          >
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                Label
              </span>
              <input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                required
                maxLength={200}
                disabled={formBusy}
                placeholder="Primary email, bank login, safe combination…"
                className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                Type
              </span>
              <select
                value={draft.itemType}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    itemType: e.target.value as SecureDraft["itemType"],
                  })
                }
                disabled={formBusy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
              >
                {SECURE_ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {LEGACY_SECURE_ITEM_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                Sensitive content
              </span>
              <textarea
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                required
                rows={5}
                maxLength={50000}
                disabled={formBusy}
                placeholder="Passwords, PINs, recovery codes, or access instructions."
                className="mt-1.5 w-full rounded-lg border border-amber-800/20 bg-amber-50/30 px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-amber-700/40"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                Link to private document{" "}
                <span className="normal-case tracking-normal">(optional)</span>
              </span>
              <select
                value={draft.relatedDocumentId}
                onChange={(e) =>
                  setDraft({ ...draft, relatedDocumentId: e.target.value })
                }
                disabled={formBusy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
              >
                <option value="">None</option>
                {documentOptions.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--legacy-muted)]">
                Notes
              </span>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={2}
                maxLength={4000}
                disabled={formBusy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={formBusy}
                className="inline-flex rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
              >
                {formBusy ? "Saving…" : "Save secure item"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setDraft(EMPTY_DRAFT);
                }}
                disabled={formBusy}
                className="inline-flex rounded-md border border-[color:var(--legacy-line)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-muted)]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
