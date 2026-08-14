"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Lock, Upload, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES,
  PRIVATE_DOCUMENT_MAX_BYTES,
} from "@/lib/documents/constants";
import type { SerializedDocumentCategory } from "@/lib/documents/serialize";
import {
  DOCUMENT_REMINDER_KINDS,
  type DocumentReminderKind,
} from "@/lib/documents/types";
import { formatBytes } from "@/lib/billing/quotas";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { beginUploadActivity } from "@/lib/session/upload-activity";
import { cn } from "@/lib/utils";

type DocumentUploadDialogProps = {
  open: boolean;
  onClose: () => void;
  categories: SerializedDocumentCategory[];
  defaultCategoryId: string;
  onUploaded: (documentId: string) => void;
};

type Phase = "form" | "uploading" | "saving" | "error";

const ACCEPT = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".rtf",
].join(",");

const ALLOWED = new Set<string>(PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES);

const REMINDER_LABEL_KEYS: Record<DocumentReminderKind, string> = {
  renewal: "documents.reminderRenewal",
  contract_end: "documents.reminderContractEnd",
  expiration: "documents.reminderExpiration",
  review: "documents.reminderReview",
  other: "documents.reminderOther",
};

function guessContentType(file: File): string {
  if (file.type && ALLOWED.has(file.type)) return file.type;
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    rtf: "application/rtf",
  };
  return (ext && map[ext]) || file.type || "";
}

export function DocumentUploadDialog({
  open,
  onClose,
  categories,
  defaultCategoryId,
  onUploaded,
}: DocumentUploadDialogProps) {
  const t = useTranslations();
  const titleId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [tagsRaw, setTagsRaw] = useState("");
  const [important, setImportant] = useState(false);
  const [documentDate, setDocumentDate] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [reminderKind, setReminderKind] =
    useState<DocumentReminderKind>("renewal");
  const [phase, setPhase] = useState<Phase>("form");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTitle("");
    setDescription("");
    setNotes("");
    setCategoryId(defaultCategoryId || categories[0]?.id || "");
    setTagsRaw("");
    setImportant(false);
    setDocumentDate("");
    setReminderAt("");
    setReminderKind("renewal");
    setPhase("form");
    setProgress(0);
    setError(null);
  }, [open, defaultCategoryId, categories]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useOverlayA11y({
    open,
    onClose,
    containerRef: dialogRef,
    escapeEnabled: phase === "form",
  });

  const tags = useMemo(
    () =>
      tagsRaw
        .split(/[,#]/)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 32),
    [tagsRaw],
  );

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(t("documents.errorChooseFile"));
      return;
    }
    const contentType = guessContentType(file);
    if (!ALLOWED.has(contentType)) {
      setError(t("documents.errorFileType"));
      return;
    }
    if (file.size > PRIVATE_DOCUMENT_MAX_BYTES) {
      setError(
        t("documents.errorFileTooLarge", {
          max: formatBytes(PRIVATE_DOCUMENT_MAX_BYTES),
        }),
      );
      return;
    }
    if (!title.trim()) {
      setError(t("documents.errorTitle"));
      return;
    }
    if (!categoryId) {
      setError(t("documents.errorCategory"));
      return;
    }

    setError(null);
    setPhase("uploading");
    setProgress(0);

    const endUpload = beginUploadActivity();
    try {
      const presignRes = await fetch("/api/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType,
          size: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presign.error || t("documents.errorPrepare"));
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presign.uploadUrl);
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(t("documents.errorStorage")));
        };
        xhr.onerror = () => reject(new Error(t("documents.errorStorage")));
        xhr.send(file);
      });

      setPhase("saving");
      const completeRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempKey: presign.key,
          filename: file.name,
          contentType,
          size: file.size,
          categoryId,
          title: title.trim(),
          description: description.trim() || null,
          notes: notes.trim() || null,
          tags,
          importantFlag: important,
          documentDate: documentDate || null,
          reminderAt: reminderAt || null,
          reminderKind: reminderAt ? reminderKind : null,
        }),
      });
      const complete = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(complete.error || t("documents.errorSave"));
      }

      onUploaded(complete.document.id as string);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : t("documents.errorUpload"));
    } finally {
      endUpload();
    }
  }

  const busy = phase === "uploading" || phase === "saving";
  const maxBytesLabel = formatBytes(PRIVATE_DOCUMENT_MAX_BYTES);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--doc-ink)]/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={cn(
          "documents-vault max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[color:var(--doc-line)] bg-[color:var(--doc-panel)] shadow-xl",
          "documents-vault-in",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--doc-line)] px-5 py-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--doc-muted)]">
              <Lock className="size-3" aria-hidden />
              {t("documents.uploadEyebrow")}
            </p>
            <h2
              id={titleId}
              className="mt-1 font-display text-xl tracking-tight text-[color:var(--doc-ink)]"
            >
              {t("documents.uploadTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1.5 text-[color:var(--doc-muted)] hover:bg-black/5 hover:text-[color:var(--doc-ink)] disabled:opacity-40"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-medium text-[color:var(--doc-muted)]">
              {t("documents.file")}
            </span>
            <input
              type="file"
              accept={ACCEPT}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                if (next && !title.trim()) {
                  setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 200));
                }
              }}
              className="mt-1.5 block w-full text-sm text-[color:var(--doc-ink)] file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--doc-accent-soft)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[color:var(--doc-accent-deep)]"
            />
            <span className="mt-1 block text-xs text-[color:var(--doc-muted)]">
              {t("documents.fileHelp", { max: maxBytesLabel })}
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[color:var(--doc-muted)]">
              {t("documents.fieldTitle")}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              maxLength={200}
              required
              className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[color:var(--doc-muted)]">
              {t("documents.fieldCategory")}
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

          <label className="block">
            <span className="text-xs font-medium text-[color:var(--doc-muted)]">
              {t("documents.fieldDescription")}{" "}
              <span className="font-normal opacity-70">
                ({t("common.optional")})
              </span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              rows={2}
              maxLength={4000}
              className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[color:var(--doc-muted)]">
              {t("documents.fieldNotes")}{" "}
              <span className="font-normal opacity-70">
                ({t("common.optional")})
              </span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
              rows={3}
              maxLength={20000}
              placeholder={t("documents.notesPlaceholder")}
              className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-[color:var(--doc-muted)]">
                {t("documents.documentDate")}
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
                {t("documents.reminderDate")}
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
              {t("documents.reminderType")}
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
                  {t(REMINDER_LABEL_KEYS[kind])}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-[color:var(--doc-muted)]">
              {t("documents.reminderHelp")}
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[color:var(--doc-muted)]">
              {t("documents.fieldTags")}{" "}
              <span className="font-normal opacity-70">
                ({t("documents.tagsHint")})
              </span>
            </span>
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              disabled={busy}
              placeholder={t("documents.tagsPlaceholder")}
              className="mt-1.5 w-full rounded-lg border border-[color:var(--doc-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--doc-accent)]"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-[color:var(--doc-ink)]">
            <input
              type="checkbox"
              checked={important}
              onChange={(e) => setImportant(e.target.checked)}
              disabled={busy}
              className="size-4 rounded border-[color:var(--doc-line)]"
            />
            {t("documents.markImportant")}
          </label>

          {busy ? (
            <div className="rounded-lg border border-[color:var(--doc-line)] bg-[color:var(--doc-surface)] px-3 py-2">
              <p className="text-sm text-[color:var(--doc-muted)]">
                {phase === "uploading"
                  ? t("documents.uploadingProgress", { progress })
                  : t("documents.savingVault")}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-[color:var(--doc-accent)] transition-all"
                  style={{
                    width: `${phase === "saving" ? 100 : progress}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-800/15 bg-red-50 px-3 py-2 text-sm text-red-900">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-[color:var(--doc-line)] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md px-3 py-2 text-sm font-medium text-[color:var(--doc-muted)] hover:bg-black/5 disabled:opacity-40"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-[color:var(--doc-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--doc-accent-deep)] disabled:opacity-50"
            >
              <Upload className="size-4" aria-hidden />
              {busy ? t("common.working") : t("common.upload")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
