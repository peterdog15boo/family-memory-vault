"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type HintTooltipProps = {
  /** Short guidance shown on hover/focus */
  tip: string;
  className?: string;
  /** Accessible label for the trigger */
  label?: string;
};

/**
 * Lightweight native-title + focusable hint — no heavy tooltip library.
 * Use next to labels where a one-liner prevents confusion.
 */
export function HintTooltip({
  tip,
  className,
  label = "More info",
}: HintTooltipProps) {
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        title={tip}
        aria-label={`${label}: ${tip}`}
        className="group relative inline-flex size-5 items-center justify-center rounded-full text-ink-muted transition hover:bg-ink/5 hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <HelpCircle className="size-3.5" aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-lg border border-ink/10 bg-canvas px-2.5 py-2 text-left text-[11px] leading-relaxed text-ink shadow-md opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {tip}
        </span>
      </button>
    </span>
  );
}
