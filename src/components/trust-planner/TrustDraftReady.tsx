"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardCopy, Download, Loader2 } from "lucide-react";
import {
  TRUST_DISCLAIMER_TEXT,
  TRUST_DRAFT_COVER_WARNING,
  type SerializedTrustDraft,
} from "@/lib/trust-planner";
import { TrustDisclaimerBanner } from "@/components/trust-planner/TrustDisclaimerBanner";
import { TrustFundingChecklist } from "@/components/trust-planner/TrustFundingChecklist";

type TrustDraftReadyProps = {
  draft: SerializedTrustDraft;
  onBackToInterview: () => void;
  onOpenHub: () => void;
  onRegenerate: () => void;
  onDraftChange: (draft: SerializedTrustDraft) => void;
  regenerating?: boolean;
};

export function TrustDraftReady({
  draft,
  onBackToInterview,
  onOpenHub,
  onRegenerate,
  onDraftChange,
  regenerating = false,
}: TrustDraftReadyProps) {
  const [copied, setCopied] = useState(false);
  const markdown = draft.generatedMarkdown ?? "";

  async function copyText() {
    if (!markdown) return;
    await navigator.clipboard.writeText(
      `${markdown}\n\n---\n${TRUST_DISCLAIMER_TEXT}`,
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <TrustDisclaimerBanner compact />

      <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--legacy-muted)]">
          Attorney planning draft
          {draft.stateCode ? ` · ${draft.stateCode}` : ""}
        </p>
        <h2 className="font-display mt-2 text-2xl text-[color:var(--legacy-ink)]">
          Your trust planning draft is ready
        </h2>
        <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
          {TRUST_DRAFT_COVER_WARNING} Still not a valid trust until an attorney
          prepares, you sign, and you fund it.
        </p>

        {draft.linkedWillDraftId ? (
          <p className="mt-3 text-sm">
            Pour-over companion:{" "}
            <Link
              href={`/legacy/will?draft=${encodeURIComponent(draft.linkedWillDraftId)}&view=hub`}
              className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
            >
              Open linked Will Planner draft
            </Link>
            . Keep residue consistent — your attorney should align both.
          </p>
        ) : draft.answers.wantsPourOverWill ? (
          <p className="mt-3 text-sm text-[color:var(--legacy-muted)]">
            Pour-over will requested —{" "}
            <Link
              href="/legacy/will"
              className="text-[color:var(--legacy-accent)] underline-offset-2 hover:underline"
            >
              start or open Will Planner
            </Link>{" "}
            for a companion draft.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="/api/legacy/trust/download?format=pdf"
            className="ui-btn ui-btn-primary inline-flex items-center gap-2"
          >
            <Download className="size-4" aria-hidden />
            Download PDF
          </a>
          <button
            type="button"
            className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
            onClick={() => void copyText()}
            disabled={!markdown}
          >
            <ClipboardCopy className="size-4" aria-hidden />
            {copied ? "Copied" : "Copy text"}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={onBackToInterview}
          >
            Edit answers
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
            onClick={onRegenerate}
            disabled={regenerating}
          >
            {regenerating ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {regenerating ? "Re-generating…" : "Re-generate draft"}
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-ghost"
            onClick={onOpenHub}
          >
            Back to hub
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] p-4 sm:p-5">
        <h3 className="font-display text-base text-[color:var(--legacy-ink)]">
          Draft preview
        </h3>
        <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[color:var(--legacy-ink)]">
          {markdown || TRUST_DISCLAIMER_TEXT}
        </pre>
      </div>

      <TrustFundingChecklist draft={draft} onDraftChange={onDraftChange} />
    </div>
  );
}
