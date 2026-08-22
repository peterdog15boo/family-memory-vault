"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clapperboard,
  FileHeart,
  ImagePlus,
  Users,
  UserRound,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type {
  CompletenessItemId,
  FamilyCompletenessSnapshot,
} from "@/lib/completeness/family-completeness";
import { cn } from "@/lib/utils";

type FamilyCompletenessCardProps = {
  snapshot: FamilyCompletenessSnapshot;
  className?: string;
};

const ITEM_ICONS = {
  mediaUploaded: ImagePlus,
  peopleNamed: UserRound,
  firstMovie: Clapperboard,
  familyInvited: Users,
  legacyStarted: FileHeart,
} as const;

/**
 * Modern dashboard — five first-wins + one next-best-action CTA.
 */
export function FamilyCompletenessCard({
  snapshot,
  className,
}: FamilyCompletenessCardProps) {
  const t = useTranslations();
  const next = snapshot.nextAction;
  const allDone = !next;

  function itemLabel(id: CompletenessItemId): string {
    return t(`completeness.item.${id}`);
  }

  function nextTitle(id: CompletenessItemId): string {
    return t(`completeness.next.${id}`);
  }

  function nextCta(id: CompletenessItemId): string {
    if (id === "legacyStarted" && !snapshot.hasLegacyPlus) {
      return t("completeness.cta.legacyStartedUpgrade");
    }
    return t(`completeness.cta.${id}`);
  }

  return (
    <section
      className={cn(
        "home-shelf rounded-2xl border border-ink/10 bg-gradient-to-br from-canvas via-canvas to-accent/5 px-5 py-5 sm:px-6 sm:py-6",
        className,
      )}
      aria-labelledby="family-completeness-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-deep">
            {t("completeness.eyebrow")}
          </p>
          <h2
            id="family-completeness-title"
            className="mt-1 font-display text-2xl tracking-tight text-ink"
          >
            {t("completeness.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {allDone
              ? t("completeness.allDoneLead")
              : t("completeness.lead", {
                  done: snapshot.doneCount,
                  total: snapshot.totalCount,
                })}
          </p>
        </div>
        <div
          className="shrink-0 text-right"
          aria-label={t("completeness.percentAria", {
            percent: snapshot.percent,
          })}
        >
          <p className="font-display text-3xl tracking-tight text-ink">
            {snapshot.percent}%
          </p>
          <p className="text-xs text-ink-muted">{t("completeness.complete")}</p>
        </div>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-valuenow={snapshot.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("completeness.title")}
      >
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${Math.min(100, Math.max(0, snapshot.percent))}%` }}
        />
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {snapshot.items.map((item) => {
          const Icon = ITEM_ICONS[item.id];
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-full items-start gap-2 rounded-xl border px-3 py-2.5 transition",
                  item.done
                    ? "border-accent/25 bg-accent/8 text-ink"
                    : "border-ink/10 bg-canvas/70 text-ink-muted hover:border-accent/30 hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    item.done
                      ? "bg-accent text-accent-foreground"
                      : "bg-ink/8 text-ink-muted",
                  )}
                >
                  {item.done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Icon className="size-3.5" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 text-sm leading-snug">
                  {itemLabel(item.id)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {next ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-canvas/80 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-accent-deep">
              {t("completeness.nextLabel")}
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink">
              {nextTitle(next.id)}
            </p>
          </div>
          <Link
            href={next.href}
            className="ui-btn ui-btn-primary ui-btn-sm inline-flex shrink-0"
          >
            {nextCta(next.id)}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <p className="mt-5 text-sm text-accent-deep">
          {t("completeness.allDoneBody")}
        </p>
      )}
    </section>
  );
}
