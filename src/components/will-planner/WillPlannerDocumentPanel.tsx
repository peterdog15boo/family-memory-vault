"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  FileUp,
  Loader2,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { WillFormPreview } from "@/components/will-planner/WillFormPreview";
import { WillSigningPanel } from "@/components/will-planner/WillSigningPanel";
import {
  WILL_FORM_PREVIEW_NOTE,
  willTextFromDocumentNotes,
} from "@/lib/will-planner";

type WillPlannerDocumentPanelProps = {
  willDraftId: string;
  documentId: string;
  notes: string | null | undefined;
  stateCode?: string | null;
  onDownload: () => void;
};

/**
 * Wills / Estate document detail: first-page will preview + planner actions.
 */
export function WillPlannerDocumentPanel({
  willDraftId,
  documentId,
  notes,
  stateCode,
  onDownload,
}: WillPlannerDocumentPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const willText = willTextFromDocumentNotes(notes);

  function regenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/legacy/will/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId: willDraftId }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Could not re-generate");
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not re-generate");
      }
    });
  }

  const editHref = `/legacy/will?draft=${encodeURIComponent(willDraftId)}&view=interview`;
  const uploadHref = `/legacy/will?draft=${encodeURIComponent(willDraftId)}&view=ready#will-signed-scan`;

  return (
    <section className="documents-vault-panel documents-vault-in mt-6 space-y-5 rounded-2xl p-5 sm:p-6">
      <div>
        <h2 className="font-display text-lg text-[color:var(--doc-ink)]">
          Will planner draft
        </h2>
        <p className="mt-1 text-sm text-[color:var(--doc-muted)]">
          {WILL_FORM_PREVIEW_NOTE}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onDownload}
          className="ui-btn ui-btn-primary inline-flex items-center gap-2"
        >
          <Download className="size-4" aria-hidden />
          Download PDF
        </button>
        <Link
          href={editHref}
          className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
        >
          <Pencil className="size-4" aria-hidden />
          Edit answers
        </Link>
        <button
          type="button"
          onClick={regenerate}
          disabled={pending}
          className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Re-generate
        </button>
        <Link
          href={uploadHref}
          className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
        >
          <FileUp className="size-4" aria-hidden />
          Upload signed scan
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:items-start">
        <WillFormPreview fullText={willText} showNote={false} />
        <div className="space-y-3">
          <WillSigningPanel stateCode={stateCode} variant="full" />
          <p className="text-xs text-[color:var(--doc-muted)]">
            File id {documentId.slice(0, 8)}… · Opens the planner for signing
            checklist and scan upload.
          </p>
        </div>
      </div>
    </section>
  );
}
