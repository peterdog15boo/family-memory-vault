"use client";

/**
 * Signed-in home (Modern consumer layout + Original denser vault).
 *
 * Quick test:
 * - xl: 4 tiles in one row; md: 2×2; phone: 1 column
 * - Tile URLs: /media, /memories, /media?scope=shared, /people
 * - Compact progress strip click opens journey details
 * - Upload from home → /upload
 * - Modern vs Original theme (Settings / ?theme=)
 * - Empty account still shows curated tiles + empty destinations
 * - Keyboard only: tiles → stats → upload (after any banner links)
 * - Desktop: home fills main pane (no phone-column max-width)
 * - Atmosphere matches Modern shell (not a dark inset widget)
 */

import Link from "next/link";
import { ArrowRight, CalendarDays, Plus, Upload } from "lucide-react";
import { BetaSurveyBanner } from "@/components/beta/BetaSurveyBanner";
import { CurrentPlanBadge } from "@/components/billing/CurrentPlanBadge";
import { StorageUsageCard } from "@/components/billing/StorageUsageCard";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { DigitizePromoCard } from "@/components/dashboard/DigitizePromoCard";
import { HomeJourneyStrip } from "@/components/dashboard/HomeJourneyStrip";
import { HomeNavTiles, type HomeTileImages } from "@/components/dashboard/HomeNavTiles";
import { HomeUploadCard } from "@/components/dashboard/HomeUploadCard";
import { MediaGallery } from "@/components/dashboard/MediaGallery";
import { ReviewStatusBanner } from "@/components/dashboard/ReviewStatusBanner";
import { LibrarySection } from "@/components/library/LibrarySection";
import { MemoryList } from "@/components/memories/MemoryList";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
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
  /** Clean/ready Photos-tile cover only (one preview; curated assets otherwise). */
  tileImages?: HomeTileImages;
};

/**
 * Modern home — image tiles, compact journey, upload on a dusk atmosphere.
 * Billing / review details stay available but visually secondary.
 */
export function DashboardHomeModern({
  displayName,
  reviewSummary,
  usage,
  onboarding,
  stripeConfigured,
  journeyBoard,
  completeness,
  onThisDayCount = 0,
  onThisDayLabel,
  tileImages,
}: DashboardHomeModernProps) {
  const t = useTranslations();
  const firstName = displayName.split(" ")[0] || "there";
  const betaMode = isBetaPlanPickerEnabled();
  const covers: HomeTileImages = tileImages ?? { photos: null };

  return (
    <div className="home-atmosphere">
      <div className="app-page app-stack home-dashboard">
        <header className="home-welcome home-welcome--row">
          <div className="home-welcome-copy">
            <p className="home-welcome-eyebrow">{t("dashboard.eyebrow")}</p>
            <h1 className="home-welcome-title">
              {t("dashboard.welcomeName", { name: firstName })}
            </h1>
          </div>
          {betaMode ? (
            <Link href="/billing" className="home-beta-chip">
              {t("dashboard.betaSwitchChip")}
            </Link>
          ) : null}
        </header>

        <div className="home-banners">
          {onboarding.show ? (
            <OnboardingChecklist progress={onboarding} />
          ) : null}
          <BetaSurveyBanner />
          <UsageLimitBanner summary={usage} />
          <ReviewStatusBanner summary={reviewSummary} />
          {onThisDayCount > 0 && onThisDayLabel ? (
            <Link href="/on-this-day" className="home-on-this-day-chip">
              <CalendarDays className="size-3.5" aria-hidden />
              <span>
                {t("dashboard.onThisDayTitle")}
                {onThisDayLabel ? ` · ${onThisDayLabel}` : ""}
                {" · "}
                {t("dashboard.onThisDayCount", { count: onThisDayCount })}
              </span>
            </Link>
          ) : null}
        </div>

        <HomeJourneyStrip board={journeyBoard} completeness={completeness} />
        <HomeNavTiles images={covers} />
        <HomeUploadCard />

        <DigitizePromoCard />

        <details className="home-panel home-account-details">
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
              betaMode={betaMode}
            />
            <StorageUsageCard snapshot={usage.storage} variant="compact" />
          </div>
        </details>
      </div>
    </div>
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
