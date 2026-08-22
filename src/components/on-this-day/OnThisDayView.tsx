"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clapperboard, Plus } from "lucide-react";
import { MediaGallery } from "@/components/dashboard/MediaGallery";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  groupOnThisDayByYear,
  type OnThisDayItem,
} from "@/lib/media/on-this-day-shared";

type OnThisDayViewProps = {
  label: string;
  items: OnThisDayItem[];
  years: number[];
};

/**
 * On This Day gallery — lightbox via MediaGallery + quick Memory/Movie paths.
 */
export function OnThisDayView({ label, items, years }: OnThisDayViewProps) {
  const t = useTranslations();
  const [yearFilter, setYearFilter] = useState<number | "all">("all");

  const groups = useMemo(() => groupOnThisDayByYear(items), [items]);
  const visibleItems = useMemo(() => {
    if (yearFilter === "all") return items;
    return items.filter((item) => item.momentYear === yearFilter);
  }, [items, yearFilter]);

  const createMemoryHref =
    visibleItems.length > 0
      ? `/memories/new?mediaIds=${visibleItems
          .slice(0, 40)
          .map((i) => i.id)
          .join(",")}`
      : "/memories/new";
  const createMovieHref =
    visibleItems.length >= 1
      ? `/memories/new?intent=movie&mediaIds=${visibleItems
          .slice(0, 40)
          .map((i) => i.id)
          .join(",")}`
      : "/memories/new?intent=movie";

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-canvas/80 px-6 py-12 text-center">
        <p className="font-display text-2xl tracking-tight text-ink">
          {t("onThisDay.emptyTitle", { date: label })}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
          {t("onThisDay.emptyBody")}
        </p>
        <Link href="/media" className="ui-btn ui-btn-secondary mt-6 inline-flex">
          {t("nav.photos")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setYearFilter("all")}
            className={
              yearFilter === "all"
                ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
                : "rounded-full border border-ink/12 px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-accent/40 hover:text-ink"
            }
          >
            {t("onThisDay.allYears")}
          </button>
          {years.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setYearFilter(year)}
              className={
                yearFilter === year
                  ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
                  : "rounded-full border border-ink/12 px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-accent/40 hover:text-ink"
              }
            >
              {year}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={createMemoryHref} className="ui-btn ui-btn-secondary ui-btn-sm">
            <Plus className="size-3.5" aria-hidden />
            {t("onThisDay.makeMemory")}
          </Link>
          <Link href={createMovieHref} className="ui-btn ui-btn-primary ui-btn-sm">
            <Clapperboard className="size-3.5" aria-hidden />
            {t("onThisDay.makeMovie")}
          </Link>
        </div>
      </div>

      {yearFilter === "all" ? (
        groups.map((group) => (
          <section key={group.year} className="space-y-3">
            <h2 className="font-display text-xl tracking-tight text-ink">
              {group.year}
            </h2>
            <MediaGallery items={group.items} emptyActionHref={null} />
          </section>
        ))
      ) : (
        <MediaGallery items={visibleItems} emptyActionHref={null} />
      )}
    </div>
  );
}
