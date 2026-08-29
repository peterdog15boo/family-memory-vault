"use client";

import { Scale } from "lucide-react";
import {
  WILL_DISCLAIMER_TEXT,
  WILL_DISCLAIMER_TITLE,
} from "@/lib/will-planner/constants";
import { cn } from "@/lib/utils";

type WillDisclaimerBannerProps = {
  compact?: boolean;
  className?: string;
};

/** Required legal posture on every Will Planner screen. */
export function WillDisclaimerBanner({
  compact = false,
  className,
}: WillDisclaimerBannerProps) {
  return (
    <aside
      className={cn(
        "flex gap-3 rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)]/70 px-4 py-3 text-sm leading-relaxed text-[color:var(--legacy-muted)]",
        className,
      )}
      role="note"
      aria-label={WILL_DISCLAIMER_TITLE}
    >
      <Scale
        className="mt-0.5 size-5 shrink-0 text-[color:var(--legacy-accent)]"
        aria-hidden
      />
      <div>
        <p className="font-medium text-[color:var(--legacy-ink)]">
          {WILL_DISCLAIMER_TITLE}
        </p>
        <p className={compact ? "mt-1 text-xs" : "mt-1"}>{WILL_DISCLAIMER_TEXT}</p>
      </div>
    </aside>
  );
}
