"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCopy,
  Download,
  FileUp,
  ListChecks,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { WillDisclaimerBanner } from "@/components/will-planner/WillDisclaimerBanner";
import { WillFormPreview } from "@/components/will-planner/WillFormPreview";
import { WillMakeRealChecklist } from "@/components/will-planner/WillMakeRealChecklist";
import { WillSigningPanel } from "@/components/will-planner/WillSigningPanel";
import {
  WILL_DISCLAIMER_TEXT,
  WILL_FORM_PREVIEW_NOTE,
  WILL_READY_LEGACY_LINKS,
  willMakeRealTone,
  willReadyStateLabel,
  type SerializedWillDraft,
} from "@/lib/will-planner";

type WillDraftReadyProps = {
  draft: SerializedWillDraft;
  onBackToInterview: () => void;
  onDraftChange: (draft: SerializedWillDraft) => void;
  onOpenHub?: () => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
};

export function WillDraftReady({
  draft,
  onBackToInterview,
  onDraftChange,
  onOpenHub,
  onRegenerate,
  regenerating = false,
}: WillDraftReadyProps) {
  const [copied, setCopied] = useState(false);
  const stateLabel = willReadyStateLabel(draft.stateCode);
  const tone = willMakeRealTone(draft.stateCode);

  async function copyText() {
    const text = draft.generatedMarkdown;
    if (!text) return;
    await navigator.clipboard.writeText(
      `${text}\n\n---\n${WILL_DISCLAIMER_TEXT}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function scrollToSignedScan() {
    document
      .getElementById("will-signed-scan")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <WillDisclaimerBanner compact />

      <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--legacy-muted)]">
          Planning draft · {stateLabel}
        </p>
        <h2 className="font-display mt-2 text-2xl text-[color:var(--legacy-ink)]">
          Your attorney draft is ready.
        </h2>
        <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
          {WILL_FORM_PREVIEW_NOTE}
        </p>
        <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm leading-relaxed text-amber-950">
          {tone}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="/api/legacy/will/download?format=pdf"
            className="ui-btn ui-btn-primary inline-flex items-center gap-2"
          >
            <Download className="size-4" aria-hidden />
            Download PDF
          </a>
          <button
            type="button"
            onClick={onBackToInterview}
            className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Edit answers
          </button>
          {onRegenerate ? (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
            >
              {regenerating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              Re-generate
            </button>
          ) : null}
          <button
            type="button"
            onClick={scrollToSignedScan}
            className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
          >
            <FileUp className="size-4" aria-hidden />
            Upload signed scan
          </button>
          <button
            type="button"
            onClick={() => void copyText()}
            className="ui-btn ui-btn-ghost inline-flex items-center gap-2"
          >
            <ClipboardCopy className="size-4" aria-hidden />
            {copied ? "Copied" : "Copy text"}
          </button>
          {onOpenHub ? (
            <button
              type="button"
              onClick={onOpenHub}
              className="ui-btn ui-btn-ghost inline-flex items-center gap-2"
            >
              Planner home
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-start">
        <WillFormPreview fullText={draft.generatedMarkdown} showNote={false} />
        <div className="space-y-4">
          <WillSigningPanel stateCode={draft.stateCode} variant="full" />
          <p className="text-xs leading-relaxed text-[color:var(--legacy-muted)]">
            State signing guidance stays beside the will text — it does not
            replace the form.
          </p>
        </div>
      </div>

      <div id="will-signed-scan" className="scroll-mt-6">
        <WillMakeRealChecklist draft={draft} onDraftChange={onDraftChange} />
      </div>

      <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <ListChecks
            className="size-5 shrink-0 text-[color:var(--legacy-accent)]"
            aria-hidden
          />
          <span className="font-display text-lg text-[color:var(--legacy-ink)]">
            Related Digital Legacy tools
          </span>
        </div>
        <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">
          Keep passwords, crypto location notes, and business how-to in these
          private spaces — not in the will draft.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {WILL_READY_LEGACY_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex rounded-lg border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-3 py-2 text-sm text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/documents?category=wills-estate"
              className="inline-flex rounded-lg border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-3 py-2 text-sm text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
            >
              Wills / Estate files
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
