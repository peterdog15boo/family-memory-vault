"use client";

import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { LegacyIntroBanner } from "@/components/legacy/LegacyIntroBanner";
import type { LegacyProgress } from "@/lib/legacy/serialize";
import { cn } from "@/lib/utils";

const PROGRESS_LABEL_KEYS: Record<string, string> = {
  message: "legacy.progressMessage",
  contacts: "legacy.progressContacts",
  primary: "legacy.progressPrimary",
  business: "legacy.progressBusiness",
  practical: "legacy.progressPractical",
  secure: "legacy.progressSecure",
  documents: "legacy.progressDocuments",
};

type LegacyOverviewProps = {
  progress: LegacyProgress;
};

export function LegacyOverview({ progress }: LegacyOverviewProps) {
  const t = useTranslations();
  const pct =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;
  const readinessLabel =
    pct >= 85
      ? t("legacy.readinessStrong")
      : pct >= 55
        ? t("legacy.readinessGood")
        : pct >= 25
          ? t("legacy.readinessStarted")
          : t("legacy.readinessBeginning");

  return (
    <div className="space-y-6">
      <LegacyIntroBanner />

      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          {t("legacy.planHeading")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {t("legacy.vaultPlannerLead")}
        </p>
        <Link
          href="/legacy"
          className="mt-4 inline-flex rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)]"
        >
          {t("legacy.openPlanner")}
        </Link>
      </section>

      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          {t("legacy.yourProgress")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {t("legacy.progressLead")}
        </p>

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[color:var(--legacy-ink)]">
              {t("legacy.areasStarted", {
                completed: progress.completed,
                total: progress.total,
              })}
            </span>
            <span className="text-[color:var(--legacy-muted)]">{pct}%</span>
          </div>
          <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">
            {t("legacy.readinessLabel", { label: readinessLabel })}
          </p>
          <div
            className="legacy-progress-bar mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--legacy-line)]"
            role="progressbar"
            aria-valuenow={progress.completed}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label={t("legacy.progressAria")}
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
                    {t(PROGRESS_LABEL_KEYS[item.id] ?? item.label)}
                  </span>
                  <span className="mt-0.5 block text-xs text-[color:var(--legacy-muted)]">
                    {item.done
                      ? t("legacy.startedReview")
                      : t("legacy.tapToAdd")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          {t("legacy.whereToBegin")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {t("legacy.whereToBeginLead")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/legacy/will"
            className="inline-flex rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            {t("legacy.navWillPlanner")}
          </Link>
          <Link
            href="/legacy/trust"
            className="inline-flex rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            {t("legacy.navTrustPlanner")}
          </Link>
          <Link
            href="/documents/legacy/message"
            className="inline-flex rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)]"
          >
            {t("legacy.writeMessage")}
          </Link>
          <Link
            href="/documents/legacy/contacts"
            className="inline-flex rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            {t("legacy.addContact")}
          </Link>
          <Link
            href="/documents/legacy/practical"
            className="inline-flex rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            {t("legacy.whereThingsAre")}
          </Link>
          <Link
            href="/documents/legacy/business"
            className="inline-flex rounded-md border border-[color:var(--legacy-line)] bg-white/60 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            {t("legacy.businessPacket")}
          </Link>
        </div>
      </section>
    </div>
  );
}
