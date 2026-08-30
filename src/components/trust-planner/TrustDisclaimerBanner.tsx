"use client";

import { Scale } from "lucide-react";
import {
  TRUST_DISCLAIMER_TEXT,
  TRUST_DISCLAIMER_TITLE,
} from "@/lib/trust-planner/constants";
import { cn } from "@/lib/utils";

type TrustDisclaimerBannerProps = {
  compact?: boolean;
  className?: string;
};

/** Required legal posture on every Trust Planner screen. */
export function TrustDisclaimerBanner({
  compact = false,
  className,
}: TrustDisclaimerBannerProps) {
  return (
    <aside
      className={cn(
        "flex gap-3 rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)]/70 px-4 py-3 text-sm leading-relaxed text-[color:var(--legacy-muted)]",
        className,
      )}
      role="note"
      aria-label={TRUST_DISCLAIMER_TITLE}
    >
      <Scale
        className="mt-0.5 size-5 shrink-0 text-[color:var(--legacy-accent)]"
        aria-hidden
      />
      <div>
        <p className="font-medium text-[color:var(--legacy-ink)]">
          {TRUST_DISCLAIMER_TITLE}
        </p>
        <p className={compact ? "mt-1 text-xs" : "mt-1"}>{TRUST_DISCLAIMER_TEXT}</p>
      </div>
    </aside>
  );
}
