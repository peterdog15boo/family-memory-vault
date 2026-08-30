"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckSquare, FileUp, Trash2, Upload } from "lucide-react";
import { PRIVATE_DOCUMENT_MAX_BYTES } from "@/lib/documents/constants";
import { formatBytes } from "@/lib/billing/quotas";
import { beginUploadActivity } from "@/lib/session/upload-activity";
import type { SerializedTrustDraft } from "@/lib/trust-planner";
import {
  buildFundingChecklistTasks,
  fundingChecklistProgress,
  isFundingUploadUnlocked,
  isTrustSignedScanContentType,
  trustFundingTone,
  type TrustFundingChecklistState,
  type TrustSignedScan,
} from "@/lib/trust-planner/funding-checklist";

type TrustFundingChecklistProps = {
  draft: SerializedTrustDraft;
  onDraftChange: (draft: SerializedTrustDraft) => void;
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png";

function guessScanContentType(file: File): string {
  if (file.type && isTrustSignedScanContentType(file.type)) return file.type;
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return (ext && map[ext]) || file.type || "";
}

function formatUploadedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function TrustFundingChecklist({
  draft,
  onDraftChange,
}: TrustFundingChecklistProps) {
  const tasks = buildFundingChecklistTasks(
    draft.answers,
    draft.stateCode,
    draft.linkedWillDraftId,
  );
  const [checks, setChecks] = useState<TrustFundingChecklistState>(
    draft.fundingChecklist,
  );
  const [signedScan, setSignedScan] = useState<TrustSignedScan | null>(
    draft.signedScan,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setChecks(draft.fundingChecklist);
    setSignedScan(draft.signedScan);
  }, [draft.id, draft.fundingChecklist, draft.signedScan, draft.updatedAt]);

  const progressInfo = fundingChecklistProgress(tasks, checks);
  const unlocked = isFundingUploadUnlocked(checks);
  const tone = trustFundingTone(draft.stateCode);

  function applyDraft(next: SerializedTrustDraft) {
    setChecks(next.fundingChecklist);
    setSignedScan(next.signedScan);
    onDraftChange(next);
  }

  function toggleTask(taskId: string, checked: boolean) {
    setSaveError(null);
    const previous = checks;
    const nextChecks: TrustFundingChecklistState = {
      checks: { ...checks.checks, [taskId]: checked },
    };
    setChecks(nextChecks);

    startTransition(async () => {
      try {
        const res = await fetch("/api/legacy/trust/checklist", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftId: draft.id,
            checks: { [taskId]: checked },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Could not save checklist");
        }
        if (data.draft) applyDraft(data.draft as SerializedTrustDraft);
      } catch (err) {
        setChecks(previous);
        setSaveError(
          err instanceof Error ? err.message : "Could not save checklist",
        );
      }
    });
  }

  async function handleFile(file: File) {
    setUploadError(null);
    const contentType = guessScanContentType(file);
    if (!isTrustSignedScanContentType(contentType)) {
      setUploadError("Use a PDF, JPEG, or PNG scan of the signed original.");
      return;
    }
    if (file.size > PRIVATE_DOCUMENT_MAX_BYTES) {
      setUploadError(
        `File is too large (max ${formatBytes(PRIVATE_DOCUMENT_MAX_BYTES)}).`,
      );
      return;
    }

    setUploading(true);
    setProgress(0);
    const endUpload = beginUploadActivity();
    try {
      const presignRes = await fetch(
        "/api/legacy/trust/signed-scan/upload-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftId: draft.id,
            filename: file.name,
            contentType,
            size: file.size,
          }),
        },
      );
      const presign = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presign.error || "Could not prepare upload");
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
          else reject(new Error("Upload to storage failed"));
        };
        xhr.onerror = () => reject(new Error("Upload to storage failed"));
        xhr.send(file);
      });

      const completeRes = await fetch("/api/legacy/trust/signed-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          tempKey: presign.key,
          filename: file.name,
          contentType,
          size: file.size,
        }),
      });
      const complete = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(complete.error || "Could not save signed scan");
      }
      if (complete.draft) {
        applyDraft(complete.draft as SerializedTrustDraft);
      } else if (complete.signedScan) {
        setSignedScan(complete.signedScan as TrustSignedScan);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Upload failed",
      );
    } finally {
      endUpload();
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Remove the uploaded scan from Legacy files? Checklist progress stays. The paper original is unchanged.",
      )
    ) {
      return;
    }
    setUploadError(null);
    try {
      const res = await fetch("/api/legacy/trust/signed-scan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not delete scan");
      }
      if (data.draft) applyDraft(data.draft as SerializedTrustDraft);
      else setSignedScan(null);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Could not delete scan",
      );
    }
  }

  return (
    <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CheckSquare
          className="mt-0.5 size-5 shrink-0 text-[color:var(--legacy-accent)]"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg text-[color:var(--legacy-ink)]">
            Sign, fund, and archive
          </h2>
          <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
            Track real-world signing and funding steps. Checking boxes does not
            fund assets or validate signatures.
          </p>
          <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm leading-relaxed text-amber-950">
            {tone}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-[color:var(--legacy-muted)]">
        Progress: {progressInfo.checked} / {progressInfo.required} required
        {pending ? " · Saving…" : null}
      </p>
      {saveError ? (
        <p className="mt-2 text-sm text-red-800" role="alert">
          {saveError}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {tasks.map((task) => {
          const checked = checks.checks[task.id] === true;
          return (
            <li key={task.id} className="flex gap-3">
              <input
                id={`trust-task-${task.id}`}
                type="checkbox"
                checked={checked}
                disabled={pending}
                onChange={(e) => toggleTask(task.id, e.target.checked)}
                className="mt-1 size-4 shrink-0 rounded border-[color:var(--legacy-line)]"
              />
              <label
                htmlFor={`trust-task-${task.id}`}
                className="text-sm leading-relaxed text-[color:var(--legacy-ink)]"
              >
                <span>{task.label}</span>
                {task.optional ? (
                  <span className="ml-1 text-xs text-[color:var(--legacy-muted)]">
                    (optional)
                  </span>
                ) : null}
                {task.href ? (
                  <span className="mt-1 block">
                    <Link
                      href={task.href}
                      className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
                    >
                      Open Will Planner checklist
                    </Link>
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 border-t border-[color:var(--legacy-line)] pt-5">
        <h3 className="text-sm font-medium text-[color:var(--legacy-ink)]">
          {unlocked ? "Upload signed trust" : "Scan of signed trust"}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[color:var(--legacy-muted)]">
          {unlocked
            ? "Archive a PDF or image of the signed paper. FMV does not verify signatures or funding."
            : "Optional archive anytime — checking attorney + signing steps first is recommended. Checking boxes still does not fund or validate."}
        </p>

        {signedScan ? (
          <div className="mt-3 rounded-lg border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-3 py-3">
            <p className="text-sm text-[color:var(--legacy-ink)]">
              Uploaded {formatUploadedDate(signedScan.uploadedAt)}. The paper
              original is still the legal document.
            </p>
            <p className="mt-1 truncate text-xs text-[color:var(--legacy-muted)]">
              {signedScan.originalFilename}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/documents/${signedScan.documentId}`}
                className="ui-btn ui-btn-secondary inline-flex items-center gap-2 text-sm"
              >
                Open in Legacy files
              </Link>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="ui-btn ui-btn-ghost inline-flex items-center gap-2 text-sm"
              >
                <Upload className="size-3.5" aria-hidden />
                Replace
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={uploading}
                className="ui-btn ui-btn-ghost inline-flex items-center gap-2 text-sm text-red-800"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete scan
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-4 py-8 text-sm text-[color:var(--legacy-muted)] hover:border-[color:var(--legacy-accent)] hover:text-[color:var(--legacy-ink)]"
          >
            <FileUp className="size-6 opacity-70" aria-hidden />
            <span>
              {unlocked
                ? "Drop or choose PDF / JPEG / PNG"
                : "Optional: scan of signed trust"}
            </span>
            <span className="text-xs">
              Max {formatBytes(PRIVATE_DOCUMENT_MAX_BYTES)} · private Legacy
              storage only
            </span>
            {uploading ? (
              <span className="text-xs">Uploading… {progress}%</span>
            ) : null}
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        {uploadError ? (
          <p className="mt-2 text-sm text-red-800" role="alert">
            {uploadError}
          </p>
        ) : null}

        <p className="mt-4 text-sm">
          <Link
            href="/documents?category=wills-estate"
            className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
          >
            Digital Legacy → Wills / Estate
          </Link>
        </p>
      </div>
    </div>
  );
}
