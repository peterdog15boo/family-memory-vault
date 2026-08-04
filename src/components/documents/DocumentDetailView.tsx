"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  Lock,
  Pencil,
  Shield,
  Trash2,
} from "lucide-react";
import type {
  SerializedDocumentCategory,
  SerializedPrivateDocument,
} from "@/lib/documents/serialize";
import { toDateInputValue } from "@/lib/documents/dates";
import {
  DOCUMENT_REMINDER_KIND_LABELS,
  DOCUMENT_REMINDER_KINDS,
  type DocumentReminderKind,
} from "@/lib/documents/types";
import { getDocumentViewKind } from "@/lib/documents/view";
import { formatBytes } from "@/lib/billing/quotas";
import { COPY } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { DocumentViewerDialog } from "@/components/documents/DocumentViewerDialog";

type DocumentDetailViewProps = {
  document: SerializedPrivateDocument;
  categories: SerializedDocumentCategory[];
  r2Configured: boolean;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function DocumentDetailView({
  document: initial,
  categories,
  r2Configured,
}: DocumentDetailViewProps) {
  const router = useRouter();
  const [doc, setDoc] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [tagsRaw, setTagsRaw] = useState(initial.tags.join(", "));
  const [important, setImportant] = useState(initial.importantFlag);
  const [documentDate, setDocumentDate] = useState(
    toDateInputValue(initial.documentDate),
  );
  const [reminderAt, setReminderAt] = useState(
    toDateInputValue(initial.reminderAt),
  );
  const [reminderKind, setReminderKind] = useState<DocumentReminderKind>(
    initial.reminderKind ?? "renewal",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const canPreviewInApp = useMemo(
    () =>
      getDocumentViewKind(doc.contentType, doc.originalFilename) !==
      "unsupported",
    [doc.contentType, doc.originalFilename],
  );

  useEffect(() => {
    setDoc(initial);
    setTitle(initial.title);
    setDescription(initial.description ?? "");
    setNotes(initial.notes ?? "");
    setCategoryId(initial.categoryId);
    setTagsRaw(initial.tags.join(", "));
    setImportant(initial.importantFlag);
    setDocumentDate(toDateInputValue(initial.documentDate));
    setReminderAt(toDateInputValue(initial.reminderAt));
    setReminderKind(initial.reminderKind ?? "renewal");
  }, [initial]);

  useEffect(() => {
    if (!doc.hasThumbnail || !r2Configured) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/documents/${doc.id}/download-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose: "thumbnail" }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.url) setPreviewUrl(data.url);
      } catch {
        // preview is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.hasThumbnail, r2Configured]);

  const categoryName = useMemo(
    () =>
      categories.find((c) => c.id === doc.categoryId)?.name ??
      doc.category?.name ??
      "Uncategorized",
    [categories, doc],
  );

  function openViewer() {
    if (!window.confirm(COPY.legacy.documentViewConfirm)) return;
    setError(null);
    setViewerOpen(true);
  }

  async function downloadDocument() {
    if (!window.confirm(COPY.legacy.documentDownloadConfirm)) return;

    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/download-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "document", confirmed: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not download file.");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download file.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const tags = tagsRaw
        .split(/[,#]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 32);
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          notes: notes.trim() || null,
          categoryId,
          tags,
          importantFlag: important,
          documentDate: documentDate || null,
          reminderAt: reminderAt || null,
          reminderKind: reminderAt ? reminderKind : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setDoc(data.document);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      const cat = categories.find((c) => c.id === doc.categoryId);
      router.push(
        cat ? `/documents?category=${encodeURIComponent(cat.slug)}` : "/documents",
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  function resetEditForm() {
    setEditing(false);
    setTitle(doc.title);
    setDescription(doc.description ?? "");
    setNotes(doc.notes ?? "");
    setCategoryId(doc.categoryId);
    setTagsRaw(doc.tags.join(", "));
    setImportant(doc.importantFlag);
    setDocumentDate(toDateInputValue(doc.documentDate));
    setReminderAt(toDateInputValue(doc.reminderAt));
    setReminderKind(doc.reminderKind ?? "renewal");
  }

  return (
    <div className="documents-vault mx-auto max-w-3xl">
      <Link
        href={
          categories.find((c) => c.id === doc.categoryId)
            ? `/documents?category=${encodeURIComponent(
                categories.find((c) => c.id === doc.categoryId)!.slug,
              )}`
            : "/documents"
        }
        className="inline-flex items-center gap-1.5 text-sm text-[color:var(--doc-muted)] transition hover:text-[color:var(--doc-ink)]"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to documents
      </Link>

      <header className="documents-vault-in mt-5">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--doc-muted)]">
          <Lock className="size-3.5" aria-hidden />
          Private document
        </p>
        <h1 className="page-title mt-2 font-display text-3xl tracking-tight text-[color:var(--doc-ink)]">
          {doc.title}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--doc-muted)]">
          {categoryName} · Uploaded {formatDate(doc.createdAt)}
          {doc.importantFlag ? " · Important" : ""}
        </p>
      </header>

      {previewUrl ? (
        <div className="documents-vault-panel documents-vault-in mt-6 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt=""
            className="mx-auto max-h-72 w-auto object-contain p-4"
          />
        </div>
      ) : null}

      <div className="documents-vault-panel documents-vault-in mt-6 rounded-2xl p-5 sm:p-6">
        {!editing ? (
          <>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--doc-muted)]">
                  Description
                </dt>
                <dd className="mt-1 leading-relaxed text-[color:var(--doc-ink)]">
                  {doc.description?.trim() || (
                    <span className="text-[color:var(--doc-muted)]">
                      No description
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--doc-muted)]">
                  Notes
                </dt>
                <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-[color:var(--doc-ink)]">
                  {doc.notes?.trim() || (
                    <span className="text-[color:var(--doc-muted)]">
                      No notes
                    </span>
                  )}
                </dd>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--doc-muted)]">
                    Category
                  </dt>
                  <dd className="mt-1 text-[color:var(--doc-ink)]">
                    {categoryName}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--doc-muted)]">
                    File
                  </dt>
                  <dd className="mt-1 text-[color:var(--doc-ink)]">
                    {doc.originalFilename} · {formatBytes(doc.sizeBytes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--doc-muted)]">
                    Document date
                  </dt>
                  <dd className="mt-1 text-[color:var(--doc-ink)]">
                    {formatDate(doc.documentDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--doc-muted)]">
                    Reminder
                  </dt>
                  <dd className="mt-1 text-[color:var(--doc-ink)]">
                    {doc.reminderAt ? (
                      <span className="inline-flex flex-col gap-1">
                        <span>
                          {formatDate(doc.reminderAt)}
                          {doc.reminderKind
                            ? ` · ${DOCUMENT_REMINDER_KIND_LABELS[doc.reminderKind]}`
                            : ""}
                        </span>
                        {doc.reminderUrgency === "overdue" ? (
                          <span className="text-xs font-medium text-red-800">
                            Overdue
                          </span>
                        ) : doc.reminderUrgency === "due_today" ? (
                          <span className="text-xs font-medium text-amber-900">
                            Due today
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "No reminder set"
                    )}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--doc-muted)]">
                  Tags
                </dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {doc.tags.length ? (
                    doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-[color:var(--doc-line)] px-2 py-0.5 text-xs text-[color:var(--doc-muted)]"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-[color:var(--doc-muted)]">None</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap gap-2 border-t border-[color:var(--doc-line)] pt-5">
              {canPreviewInApp ? (
                <button
                  type="button"
                  onClick={openViewer}
                  disabled={busy || !r2Configured}
                  className="inline-flex items-center gap-2 rounded-md bg-[color:var(--doc-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--doc-accent-deep)] disabled:opacity-50"
                >
                  <Eye className="size-4" aria-hidden />
                  View
                </button>
              ) : null}
              <button
                type="button"
                onClick={downloadDocument}
                disabled={busy || !r2Configured}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3.5 py-2.5 text-sm font-medium disabled:opacity-50",
                  canPreviewInApp
                    ? "border border-[color:var(--doc-line)] bg-white/60 text-[color:var(--doc-ink)] hover:bg-[color:var(--doc-accent-soft)]"
                    : "bg-[color:var(--doc-accent)] text-white hover:bg-[color:var(--doc-accent-deep)]",
                )}
              >
                <Download className="size-4" aria-hidden />
                Download
                <ExternalLink className="size-3.5 opacity-70" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-md border border-[color:var(--doc-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--doc-ink)] hover:bg-[color:var(--doc-accent-soft)]"
              >
                <Pencil className="size-4" aria-hidden />
                Edit metadata
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 rounded-md border border-red-800/20 px-3.5 py-2.5 text-sm font-medium text-red-800 hover:bg-red-50"
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={saveMetadata} className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                Title
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
                disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={4000}
                disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                maxLength={20000}
                disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                Category
              </span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                  Document date
                </span>
                <input
                  type="date"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  disabled={busy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                  Reminder date
                </span>
                <input
                  type="date"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                  disabled={busy}
                  className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                Reminder type
              </span>
              <select
                value={reminderKind}
                onChange={(e) =>
                  setReminderKind(e.target.value as DocumentReminderKind)
                }
                disabled={busy || !reminderAt}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)] disabled:opacity-50"
              >
                {DOCUMENT_REMINDER_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {DOCUMENT_REMINDER_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-[color:var(--doc-muted)]">
                Clear the date to remove the reminder. Overdue items show up in
                the Reminders view.
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                Tags
              </span>
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={important}
                onChange={(e) => setImportant(e.target.checked)}
                disabled={busy}
                className="size-4"
              />
              Mark as important
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[color:var(--doc-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--doc-accent-deep)] disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={resetEditForm}
                className="rounded-md px-3 py-2 text-sm text-[color:var(--doc-muted)] hover:bg-black/5"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {confirmDelete ? (
          <div
            className={cn(
              "mt-5 rounded-xl border border-red-800/20 bg-red-50/80 px-4 py-3",
            )}
          >
            <p className="text-sm text-red-950">
              Delete <strong>{doc.title}</strong>? The file will be removed from
              your vault permanently.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={deleteDocument}
                disabled={busy}
                className="rounded-md bg-red-800 px-3 py-2 text-sm font-medium text-white hover:bg-red-900 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={busy}
                className="rounded-md px-3 py-2 text-sm text-red-900/80 hover:bg-red-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-800/15 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        ) : null}
      </div>

      <p className="mt-8 flex gap-2 text-xs leading-relaxed text-[color:var(--doc-muted)]">
        <Shield
          className="mt-0.5 size-3.5 shrink-0 text-[color:var(--doc-accent)]"
          aria-hidden
        />
        View and download are logged and short-lived. This document is never
        shown in family galleries.
      </p>

      {viewerOpen ? (
        <DocumentViewerDialog
          document={doc}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </div>
  );
}
