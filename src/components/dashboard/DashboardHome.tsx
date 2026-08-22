"use client";

import Link from "next/link";
import { ArrowRight, Bot, CalendarDays, Clapperboard, Plus, Upload } from "lucide-react";
import { AskAiOpenButton } from "@/components/assistant/AskAiOpenButton";
import { BetaSurveyBanner } from "@/components/beta/BetaSurveyBanner";
import { CurrentPlanBadge } from "@/components/billing/CurrentPlanBadge";
import { StorageUsageCard } from "@/components/billing/StorageUsageCard";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { DigitizePromoCard } from "@/components/dashboard/DigitizePromoCard";
import { MediaGallery } from "@/components/dashboard/MediaGallery";
import { ReviewStatusBanner } from "@/components/dashboard/ReviewStatusBanner";
import { LibrarySection } from "@/components/library/LibrarySection";
import { MemoryList } from "@/components/memories/MemoryList";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { PageHero } from "@/components/ui/PageHero";
import { useCopy, useTranslations } from "@/components/i18n/LocaleProvider";
import { FamilyCompletenessCard } from "@/components/dashboard/FamilyCompletenessCard";
import { LegacyJourneyCard } from "@/components/gamification/LegacyJourneyCard";
import type { AccountUsageSummary } from "@/lib/billing/account-usage";
import { isBetaPlanPickerEnabled } from "@/lib/billing/beta-flags";
import type { FamilyCompletenessSnapshot } from "@/lib/completeness/family-completeness";
import type { JourneyBoardSnapshot } from "@/lib/gamification/journey-board";
import type { MediaReviewSummary, SafeMediaItem } from "@/lib/media/queries";
import type { MemoryListItem } from "@/lib/memories";
import type { OnboardingProgress } from "@/lib/onboarding";

type DashboardHomeModernProps = {
  displayName: string;
  mediaOwn: SafeMediaItem[];
  mediaShared: SafeMediaItem[];
  hasFamilyMedia: boolean;
  memoriesOwn: MemoryListItem[];
  memoriesShared: MemoryListItem[];
  hasFamilyMemories: boolean;
  reviewSummary: MediaReviewSummary;
  usage: AccountUsageSummary;
  onboarding: OnboardingProgress;
  stripeConfigured: boolean;
  journeyBoard: JourneyBoardSnapshot;
  completeness: FamilyCompletenessSnapshot;
  /** Prior-year moments for today's month/day (0 hides teaser). */
  onThisDayCount?: number;
  onThisDayLabel?: string;
};

/**
 * Modern home — gallery-first welcome, not an ops console.
 * Billing / review details stay available but visually secondary.
 */
export function DashboardHomeModern({
  displayName,
  mediaOwn,
  mediaShared,
  hasFamilyMedia,
  memoriesOwn,
  memoriesShared,
  hasFamilyMemories,
  reviewSummary,
  usage,
  onboarding,
  stripeConfigured,
  journeyBoard,
  completeness,
  onThisDayCount = 0,
  onThisDayLabel,
}: DashboardHomeModernProps) {
  const copy = useCopy();
  const t = useTranslations();
  const firstName = displayName.split(" ")[0] || "there";
  const hasMemories = memoriesOwn.length > 0;
  const hasPhotos = mediaOwn.length > 0;

  return (
    <>
      <PageHero
        slot="dashboard"
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.welcomeName", { name: firstName })}
        description={t("dashboard.heroDescription")}
        actions={
          <>
            <Link href="/upload" className="ui-btn ui-btn-primary ui-btn-lg">
              <Upload className="size-4" aria-hidden />
              {t("pages.mediaAdd")}
            </Link>
            <Link href="/memories/new" className="ui-btn ui-btn-secondary ui-btn-lg">
              <Plus className="size-4" aria-hidden />
              {t("pages.createMemory")}
            </Link>
            <AskAiOpenButton className="ui-btn ui-btn-ghost ui-btn-lg">
              <Bot className="size-4" aria-hidden />
              {t("nav.askAi")}
            </AskAiOpenButton>
          </>
        }
      />

      <div className="app-page app-stack home-dashboard mx-auto max-w-6xl">
        {onboarding.show ? (
          <OnboardingChecklist progress={onboarding} />
        ) : null}

        <BetaSurveyBanner />
        <UsageLimitBanner summary={usage} />
        <FamilyCompletenessCard snapshot={completeness} />
        <LegacyJourneyCard initial={journeyBoard} />

        {onThisDayCount > 0 && onThisDayLabel ? (
          <section
            className="home-shelf"
            aria-labelledby="home-on-this-day-title"
          >
            <div className="home-shelf-header">
              <div>
                <h2 id="home-on-this-day-title" className="home-shelf-title">
                  {t("dashboard.onThisDayTitle")}
                </h2>
                <p className="home-shelf-lead">
                  {t("dashboard.onThisDayLead", { date: onThisDayLabel })}
                </p>
              </div>
              <Link href="/on-this-day" className="home-shelf-link">
                <CalendarDays className="size-3.5" aria-hidden />
                {t("dashboard.onThisDayOpen")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            <p className="text-sm text-ink-muted">
              {t("dashboard.onThisDayCount", { count: onThisDayCount })}
            </p>
          </section>
        ) : null}

        <section className="home-shelf" aria-labelledby="home-memories-title">
          <div className="home-shelf-header">
            <div>
              <h2 id="home-memories-title" className="home-shelf-title">
                {t("dashboard.recentMemories")}
              </h2>
              <p className="home-shelf-lead">
                {t("dashboard.recentMemoriesLead")}
              </p>
            </div>
            <Link href="/memories" className="home-shelf-link">
              {t("dashboard.allMemories")}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {hasMemories ? (
            <MemoryList memories={memoriesOwn} showActions={false} />
          ) : (
            <div className="home-empty">
              <p className="home-empty-title">{t("dashboard.noAlbumsYet")}</p>
              <p className="home-empty-copy">{t("dashboard.noAlbumsYetBody")}</p>
              <Link href="/memories/new" className="ui-btn ui-btn-primary">
                <Plus className="size-4" aria-hidden />
                {t("pages.createMemory")}
              </Link>
            </div>
          )}
        </section>

        {hasFamilyMemories || memoriesShared.length > 0 ? (
          <section className="home-shelf" aria-labelledby="home-shared-title">
            <div className="home-shelf-header">
              <div>
                <h2 id="home-shared-title" className="home-shelf-title">
                  {t("dashboard.sharedWithFamily")}
                </h2>
                <p className="home-shelf-lead">
                  {t("dashboard.sharedAlbumsLead")}
                </p>
              </div>
              <Link href="/memories" className="home-shelf-link">
                {t("dashboard.viewShared")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            <MemoryList
              memories={memoriesShared}
              emptyVariant="shared"
              showActions={false}
            />
          </section>
        ) : null}

        <section className="home-shelf" aria-labelledby="home-photos-title">
          <div className="home-shelf-header">
            <div>
              <h2 id="home-photos-title" className="home-shelf-title">
                {t("dashboard.recentPhotos")}
              </h2>
              <p className="home-shelf-lead">
                {t("dashboard.recentPhotosLead")}
              </p>
            </div>
            <div className="home-shelf-links">
              <Link href="/movies" className="home-shelf-link">
                <Clapperboard className="size-3.5" aria-hidden />
                {t("nav.movies")}
              </Link>
              <Link href="/media" className="home-shelf-link">
                {t("dashboard.allPhotos")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
          {hasPhotos ? (
            <MediaGallery items={mediaOwn} />
          ) : (
            <div className="home-empty">
              <p className="home-empty-title">{copy.empty.mediaOwn.title}</p>
              <p className="home-empty-copy">
                {copy.empty.mediaOwn.description}
              </p>
              <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <Link href="/upload" className="ui-btn ui-btn-primary">
                  <Upload className="size-4" aria-hidden />
                  {t("pages.uploadPhotos")}
                </Link>
                <Link
                  href="/family-memory-box"
                  className="text-sm font-medium text-ink-muted underline-offset-2 transition hover:text-ink hover:underline"
                >
                  {t("pages.digitizeOld")}
                </Link>
              </div>
            </div>
          )}
        </section>

        {hasFamilyMedia || mediaShared.length > 0 ? (
          <section className="home-shelf" aria-labelledby="home-family-photos">
            <div className="home-shelf-header">
              <div>
                <h2 id="home-family-photos" className="home-shelf-title">
                  {t("dashboard.familyPhotos")}
                </h2>
                <p className="home-shelf-lead">
                  {t("dashboard.familyPhotosLead")}
                </p>
              </div>
            </div>
            <MediaGallery
              items={mediaShared}
              emptyTitle={copy.empty.mediaShared.title}
              emptyDescription={copy.empty.mediaShared.description}
              emptyActionHref={null}
              emptySecondaryAction={null}
            />
          </section>
        ) : null}

        <DigitizePromoCard />

        <details className="home-account-details">
          <summary className="home-account-summary">
            {t("dashboard.planStorage")}
          </summary>
          <div className="home-account-panel app-overview">
            <CurrentPlanBadge
              planName={usage.planName}
              planSlug={usage.planSlug}
              billingInterval={usage.billingInterval}
              planSource={usage.planSource}
              canManageBilling={usage.canManageBilling}
              stripeConfigured={stripeConfigured}
              betaMode={isBetaPlanPickerEnabled()}
            />
            <StorageUsageCard snapshot={usage.storage} variant="compact" />
            <ReviewStatusBanner summary={reviewSummary} />
          </div>
        </details>
      </div>
    </>
  );
}

/** Original dashboard composition — denser overview kept for theme revert. */
export function DashboardHomeOriginal({
  mediaOwn,
  mediaShared,
  hasFamilyMedia,
  memoriesOwn,
  memoriesShared,
  hasFamilyMemories,
  reviewSummary,
  usage,
  onboarding,
  stripeConfigured,
  journeyBoard,
  completeness,
  onThisDayCount = 0,
  onThisDayLabel,
}: Omit<DashboardHomeModernProps, "displayName">) {
  const copy = useCopy();
  const t = useTranslations();
  return (
    <>
      <AppPageIntro
        slot="dashboard"
        title={t("dashboard.originalTitle")}
        description={t("dashboard.originalDescription")}
        actions={
          <>
            <Link href="/memories/new" className="ui-btn ui-btn-secondary">
              <Plus className="size-4 text-accent-deep" aria-hidden />
              {t("pages.createMemory")}
            </Link>
            <Link href="/upload" className="ui-btn ui-btn-primary">
              <Upload className="size-4" aria-hidden />
              {t("pages.mediaAdd")}
            </Link>
          </>
        }
      />

      <div className="app-page app-stack mx-auto max-w-6xl">
        {onboarding.show ? (
          <OnboardingChecklist progress={onboarding} />
        ) : null}

        <BetaSurveyBanner />
        <LegacyJourneyCard initial={journeyBoard} />
        <FamilyCompletenessCard snapshot={completeness} />

        {onThisDayCount > 0 && onThisDayLabel ? (
          <section className="rounded-2xl border border-ink/10 bg-canvas/60 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink">
                  {t("dashboard.onThisDayTitle")}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {t("dashboard.onThisDayLead", { date: onThisDayLabel })}{" "}
                  {t("dashboard.onThisDayCount", { count: onThisDayCount })}
                </p>
              </div>
              <Link href="/on-this-day" className="ui-btn ui-btn-secondary ui-btn-sm">
                <CalendarDays className="size-3.5" aria-hidden />
                {t("dashboard.onThisDayOpen")}
              </Link>
            </div>
          </section>
        ) : null}

        <section
          className="app-overview"
          aria-label={t("dashboard.planStorage")}
        >
          <UsageLimitBanner summary={usage} />
          <CurrentPlanBadge
              planName={usage.planName}
              planSlug={usage.planSlug}
              billingInterval={usage.billingInterval}
              planSource={usage.planSource}
              canManageBilling={usage.canManageBilling}
              stripeConfigured={stripeConfigured}
              betaMode={isBetaPlanPickerEnabled()}
          />
          <StorageUsageCard snapshot={usage.storage} variant="compact" />
          <ReviewStatusBanner summary={reviewSummary} />
        </section>

        <LibrarySection
          title={t("dashboard.myMemories")}
          description={t("dashboard.recentMemoriesLead")}
          count={memoriesOwn.length}
          actions={
            <Link
              href="/memories"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep transition hover:text-accent"
            >
              {t("common.viewAll")}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        >
          {memoriesOwn.length === 0 ? (
            <MemoryList memories={[]} emptyVariant="first" showActions={false} />
          ) : (
            <MemoryList memories={memoriesOwn} showActions />
          )}
        </LibrarySection>

        {hasFamilyMemories || memoriesShared.length > 0 ? (
          <LibrarySection
            title={t("dashboard.sharedWithFamily")}
            description={t("dashboard.sharedAlbumsLead")}
            count={memoriesShared.length}
            variant="shared"
            actions={
              <Link
                href="/memories"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep transition hover:text-accent"
              >
                {t("common.viewAll")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            <MemoryList
              memories={memoriesShared}
              emptyVariant="shared"
              showActions
            />
          </LibrarySection>
        ) : null}

        <LibrarySection
          title={t("pages.mediaTitle")}
          description={t("dashboard.recentPhotosLead")}
          count={mediaOwn.length}
          actions={
            <Link
              href="/media"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep transition hover:text-accent"
            >
              {t("common.viewAll")}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        >
          <MediaGallery
            items={mediaOwn}
            emptySecondaryAction={{
              href: "/family-memory-box",
              label: t("pages.digitizeOld"),
            }}
          />
        </LibrarySection>

        {hasFamilyMedia || mediaShared.length > 0 ? (
          <LibrarySection
            title={t("dashboard.sharedWithFamily")}
            description={t("dashboard.familyPhotosLead")}
            count={mediaShared.length}
            variant="shared"
            actions={
              <Link
                href="/media"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep transition hover:text-accent"
              >
                {t("common.viewAll")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          >
            <MediaGallery
              items={mediaShared}
              emptyTitle={copy.empty.mediaShared.title}
              emptyDescription={copy.empty.mediaShared.description}
              emptyActionHref={null}
              emptySecondaryAction={null}
            />
          </LibrarySection>
        ) : null}

        <DigitizePromoCard />
      </div>
    </>
  );
}
