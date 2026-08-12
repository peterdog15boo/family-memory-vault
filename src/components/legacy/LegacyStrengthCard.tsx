"use client";

import Link from "next/link";
import { ArrowRight, Shield } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export type LegacyStrengthSnapshot = {
  strengthPercent: number;
  completenessPercent: number;
  documentationPercent: number;
  nextTitle: string | null;
  nextHref: string;
};

export function LegacyStrengthCard({
  snapshot,
  className,
}: {
  snapshot: LegacyStrengthSnapshot;
  className?: string;
}) {
  const t = useTranslations();
  const pct = Math.max(0, Math.min(100, snapshot.strengthPercent));
  const ring = 2 * Math.PI * 28;
  const dash = ring * (1 - pct / 100);

  return (
    <section
      className={cn(
        "legacy-strength-card ui-card ui-card-elevated flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5",
        className,
      )}
      aria-label={t("legacy.strengthAria")}
    >
      <span className="relative inline-flex size-16 shrink-0 items-center justify-center">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="color-mix(in srgb, var(--ink) 10%, transparent)"
            strokeWidth="5"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={ring}
            strokeDashoffset={dash}
          />
        </svg>
        <Shield className="absolute size-5 text-accent-deep" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-deep">
          {t("legacy.strengthTitle")}
        </p>
        <p className="mt-0.5 text-lg font-semibold tracking-tight text-ink">
          {t("legacy.strengthPercent", { percent: pct })}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
          {snapshot.nextTitle
            ? t("legacy.strengthNext", { name: snapshot.nextTitle })
            : t("legacy.strengthComplete")}
        </p>
      </div>

      <Link href={snapshot.nextHref} className="ui-btn ui-btn-secondary shrink-0">
        {t("legacy.strengthCta")}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  );
}
