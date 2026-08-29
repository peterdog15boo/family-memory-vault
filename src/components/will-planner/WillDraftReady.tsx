"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardCopy,
  Download,
  FileText,
  ListChecks,
} from "lucide-react";
import { WillDisclaimerBanner } from "@/components/will-planner/WillDisclaimerBanner";
import { WillMakeRealChecklist } from "@/components/will-planner/WillMakeRealChecklist";
import { WillSigningPanel } from "@/components/will-planner/WillSigningPanel";
import {
  WILL_DISCLAIMER_TEXT,
  WILL_READY_LEGACY_LINKS,
  buildWillReadyChecklist,
  willMakeRealTone,
  willReadyStateLabel,
  type SerializedWillDraft,
} from "@/lib/will-planner";

type WillDraftReadyProps = {
  draft: SerializedWillDraft;
  onBackToInterview: () => void;
  onDraftChange: (draft: SerializedWillDraft) => void;
};

export function WillDraftReady({
  draft,
  onBackToInterview,
  onDraftChange,
}: WillDraftReadyProps) {
  const [copied, setCopied] = useState(false);
  const [showChecklist, setShowChecklist] = useState(true);
  const stateLabel = willReadyStateLabel(draft.stateCode);
  const checklist = buildWillReadyChecklist(draft.stateCode);
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
          This is a planning draft for counsel to review — not a legally
          effective will. Download a copy, then follow the checklist below.
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
          <a
            href="/api/legacy/will/download?format=docx"
            className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
          >
            <FileText className="size-4" aria-hidden />
            Download .docx
          </a>
          <button
            type="button"
            onClick={() => void copyText()}
            className="ui-btn ui-btn-ghost inline-flex items-center gap-2"
          >
            <ClipboardCopy className="size-4" aria-hidden />
            {copied ? "Copied" : "Copy text"}
          </button>
          <button
            type="button"
            onClick={onBackToInterview}
            className="ui-btn ui-btn-ghost inline-flex items-center gap-2"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to interview
          </button>
        </div>
      </div>

      <WillSigningPanel stateCode={draft.stateCode} variant="full" />

      <WillMakeRealChecklist draft={draft} onDraftChange={onDraftChange} />

      <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setShowChecklist((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <ListChecks
            className="size-5 shrink-0 text-[color:var(--legacy-accent)]"
            aria-hidden
          />
          <span className="font-display text-lg text-[color:var(--legacy-ink)]">
            What to do next
          </span>
        </button>
        {showChecklist ? (
          <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-[color:var(--legacy-ink)]">
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : null}

        <div className="mt-6 border-t border-[color:var(--legacy-line)] pt-5">
          <p className="text-sm font-medium text-[color:var(--legacy-ink)]">
            Related Digital Legacy tools
          </p>
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

      {draft.generatedMarkdown ? (
        <details className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--legacy-ink)]">
            Preview draft text
          </summary>
          <pre className="mt-4 max-h-[28rem] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--legacy-ink)]">
            {draft.generatedMarkdown}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
