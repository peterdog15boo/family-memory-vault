"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { LegacyIntroBanner } from "@/components/legacy/LegacyIntroBanner";
import type { LegacyProgress } from "@/lib/legacy/serialize";
import { cn } from "@/lib/utils";

type LegacyOverviewProps = {
  progress: LegacyProgress;
};

export function LegacyOverview({ progress }: LegacyOverviewProps) {
  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;
  const readinessLabel =
    pct >= 85
      ? "Strong foundation"
      : pct >= 55
        ? "Good momentum"
        : pct >= 25
          ? "Getting started"
          : "Just beginning";

  return (
    <div className="space-y-6">
      <LegacyIntroBanner />

      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          Your progress
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          Take this at your own pace. Each step you complete is a thoughtful gift
          to the people who may one day need it.
        </p>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[color:var(--legacy-ink)]">
              {progress.completed} of {progress.total} areas started
            </span>
            <span className="text-[color:var(--legacy-muted)]">{pct}%</span>
          </div>
          <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">
            Legacy readiness: {readinessLabel}
          </p>
          <div
            className="legacy-progress-bar mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--legacy-line)]"
            role="progressbar"
            aria-valuenow={progress.completed}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label="Digital Legacy progress"
          >
            <div
              className="h-full rounded-full bg-[color:var(--legacy-accent)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ul className="mt-6 space-y-2">
          {progress.items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(
                  "legacy-progress-item flex items-start gap-3 rounded-xl border px-4 py-3 transition",
                  item.done
                    ? "border-[color:var(--legacy-accent)]/25 bg-[color:var(--legacy-accent-soft)]"
                    : "border-[color:var(--legacy-line)] bg-white/40 hover:border-[color:var(--legacy-accent)]/30 hover:bg-[color:var(--legacy-accent-soft)]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    item.done
                      ? "bg-[color:var(--legacy-accent)] text-white"
                      : "border border-[color:var(--legacy-line)] text-[color:var(--legacy-muted)]",
                  )}
                  aria-hidden
                >
                  {item.done ? (
                    <Check className="size-3" />
                  ) : (
                    <Circle className="size-3" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[color:var(--legacy-ink)]">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-[color:var(--legacy-muted)]">
                    {item.done ? "Started — tap to review" : "Tap to add something"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          Where to begin
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          Many people start with a short message and one trusted contact. You can
          return anytime to add business notes, practical details, or secure access
          information.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/documents/legacy/message"
            className="inline-flex rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)]"
          >
            Write a message
          </Link>
          <Link
            href="/documents/legacy/contacts"
            className="inline-flex rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            Add a contact
          </Link>
          <Link
            href="/documents/legacy/practical"
            className="inline-flex rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            Where things are
          </Link>
          <Link
            href="/documents/legacy/business"
            className="inline-flex rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            Business packet
          </Link>
        </div>
      </section>
    </div>
  );
}
