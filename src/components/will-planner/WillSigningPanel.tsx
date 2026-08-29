"use client";

import { Scale } from "lucide-react";
import {
  WILL_SIGNING_PANEL_DISCLAIMER,
  WILL_UNIVERSAL_WITNESS_GUIDANCE,
  getWillExecutionForState,
  willExecutionShortBullets,
  willExecutionStateLabel,
  type WillExecutionByState,
} from "@/lib/legacy/will-execution-by-state";
import { cn } from "@/lib/utils";

type WillSigningPanelProps = {
  stateCode: string | null | undefined;
  /** full = ready page / sidebar; short = domicile step */
  variant?: "full" | "short";
  className?: string;
};

function holographicLine(info: WillExecutionByState): string | null {
  if (info.holographic === "recognized_not_recommended") {
    return "This state may accept a fully handwritten will. That is easy to contest. Use a lawyer-supervised signing.";
  }
  return null;
}

function eWillLine(info: WillExecutionByState): string | null {
  if (info.eWills === "maybe_ask_attorney") {
    return "Your state may allow electronic execution. Do not sign this PDF in DocuSign and assume it is a will.";
  }
  return null;
}

/**
 * Educational “How to sign this draft” panel.
 * Never includes e-sign, witness capture, notary APIs, or validity checkboxes
 * that claim the draft was executed.
 */
export function WillSigningPanel({
  stateCode,
  variant = "full",
  className,
}: WillSigningPanelProps) {
  const info = getWillExecutionForState(stateCode);
  const stateName = willExecutionStateLabel(
    info.stateCode === "DEFAULT" ? null : info.stateCode,
  );
  const missingState = !stateCode?.trim() || info.stateCode === "DEFAULT";

  if (variant === "short") {
    if (!stateCode?.trim()) return null;
    const shorts = willExecutionShortBullets(info);
    return (
      <aside
        className={cn(
          "rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-accent-soft)]/35 px-3 py-3 text-xs leading-relaxed text-[color:var(--legacy-muted)]",
          className,
        )}
        role="note"
        aria-label={`Signing in ${stateName}`}
      >
        <p className="font-medium text-[color:var(--legacy-ink)]">
          Signing in {stateName}
        </p>
        <p className="mt-1.5">{WILL_SIGNING_PANEL_DISCLAIMER}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {shorts.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </aside>
    );
  }

  const extraLines = [
    holographicLine(info),
    eWillLine(info),
  ].filter(Boolean) as string[];

  return (
    <section
      className={cn(
        "rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-5 sm:p-6",
        className,
      )}
      aria-labelledby="will-signing-heading"
    >
      <div className="flex gap-3">
        <Scale
          className="mt-0.5 size-5 shrink-0 text-[color:var(--legacy-accent)]"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2
            id="will-signing-heading"
            className="font-display text-lg text-[color:var(--legacy-ink)]"
          >
            Signing in {missingState ? "your state" : stateName}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
            {WILL_SIGNING_PANEL_DISCLAIMER}
          </p>
          {missingState ? (
            <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
              Set your state of domicile on the About you step for more specific
              notes. Until then, here is the conservative two-witness default.
            </p>
          ) : null}

          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--legacy-muted)]">
            State checklist
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[color:var(--legacy-ink)]">
            {info.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
            {extraLines.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-[color:var(--legacy-muted)]">
            {info.minAgeNote}
          </p>

          {info.caution ? (
            <p
              className="mt-3 rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)] px-3 py-2 text-sm text-[color:var(--legacy-ink)]"
              role="note"
            >
              {info.caution}
            </p>
          ) : null}

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--legacy-muted)]">
            Witness guidance (all states)
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[color:var(--legacy-ink)]">
            {WILL_UNIVERSAL_WITNESS_GUIDANCE.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          <p className="mt-5 text-sm font-medium text-[color:var(--legacy-ink)]">
            Next step — take this draft to a licensed attorney in{" "}
            {missingState ? "your state" : stateName}. They will run the signing
            and any self-proving affidavit.
          </p>
        </div>
      </div>
    </section>
  );
}
