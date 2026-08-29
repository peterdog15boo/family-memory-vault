"use client";

import { WILL_DRAFT_PAGE_HEADER } from "@/lib/will-planner/generate";
import {
  WILL_FORM_PREVIEW_NOTE,
  willFormFirstPagePreview,
} from "@/lib/will-planner/preview";
import { cn } from "@/lib/utils";

type WillFormPreviewProps = {
  fullText: string | null | undefined;
  className?: string;
  /** Show the short “reads like a will” note above the page. */
  showNote?: boolean;
};

/**
 * First-page preview of the proforma Last Will and Testament.
 */
export function WillFormPreview({
  fullText,
  className,
  showNote = true,
}: WillFormPreviewProps) {
  const preview = willFormFirstPagePreview(fullText);

  if (!preview) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-dashed border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-4 py-8 text-center text-sm text-[color:var(--legacy-muted)]",
          className,
        )}
      >
        Generate the attorney draft to preview the will form.
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {showNote ? (
        <p className="text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {WILL_FORM_PREVIEW_NOTE}
        </p>
      ) : null}
      <div
        className="overflow-hidden rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] shadow-sm"
        aria-label="Will form first-page preview"
      >
        <div className="border-b border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--legacy-muted)]">
          {WILL_DRAFT_PAGE_HEADER}
        </div>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap px-5 py-5 font-serif text-[13px] leading-relaxed text-[color:var(--legacy-ink)] sm:text-sm">
          {preview}
        </pre>
      </div>
    </div>
  );
}
