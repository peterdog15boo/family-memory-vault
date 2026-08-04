import Link from "next/link";
import { ArrowRight, Clapperboard, Plus, Sparkles, Upload } from "lucide-react";
import { AskAiOpenButton } from "@/components/assistant/AskAiOpenButton";
import { CurrentPlanBadge } from "@/components/billing/CurrentPlanBadge";
import { StorageUsageCard } from "@/components/billing/StorageUsageCard";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { MediaGallery } from "@/components/dashboard/MediaGallery";
import { ReviewStatusBanner } from "@/components/dashboard/ReviewStatusBanner";
import { LibrarySection } from "@/components/library/LibrarySection";
import { MemoryList } from "@/components/memories/MemoryList";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { PageHero } from "@/components/ui/PageHero";
import { COPY } from "@/lib/copy";
import type { AccountUsageSummary } from "@/lib/billing/account-usage";
import type { MediaReviewSummary } from "@/lib/media/queries";
import type { SafeMediaItem } from "@/lib/media/queries";
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
}: DashboardHomeModernProps) {
  const firstName = displayName.split(" ")[0] || "there";
  const hasMemories = memoriesOwn.length > 0;
  const hasPhotos = mediaOwn.length > 0;

  return (
    <>
      <PageHero
        slot="dashboard"
        eyebrow="Your vault"
        title={`Welcome back, ${firstName}`}
        description="Photos and stories your family already loves — kept calm and close."
        actions={
          <>
            <Link href="/upload" className="ui-btn ui-btn-primary ui-btn-lg">
              <Upload className="size-4" aria-hidden />
              Add photos
            </Link>
            <Link href="/memories/new" className="ui-btn ui-btn-secondary ui-btn-lg">
              <Plus className="size-4" aria-hidden />
              Create a memory
            </Link>
            <AskAiOpenButton className="ui-btn ui-btn-ghost ui-btn-lg">
              <Sparkles className="size-4" aria-hidden />
              Ask AI
            </AskAiOpenButton>
          </>
        }
      />

      <div className="app-page app-stack home-dashboard mx-auto max-w-6xl">
      {onboarding.show ? (
        <OnboardingChecklist progress={onboarding} />
      ) : null}

      <UsageLimitBanner summary={usage} />

      <section className="home-shelf" aria-labelledby="home-memories-title">
        <div className="home-shelf-header">
          <div>
            <h2 id="home-memories-title" className="home-shelf-title">
              Recent memories
            </h2>
            <p className="home-shelf-lead">
              Albums you’ve been gathering.
            </p>
          </div>
          <Link href="/memories" className="home-shelf-link">
            All memories
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {hasMemories ? (
          <MemoryList memories={memoriesOwn} showActions={false} />
        ) : (
          <div className="home-empty">
            <p className="home-empty-title">No albums yet</p>
            <p className="home-empty-copy">
              Create a memory to gather photos into a story your family can
              revisit.
            </p>
            <Link href="/memories/new" className="ui-btn ui-btn-primary">
              <Plus className="size-4" aria-hidden />
              Create a memory
            </Link>
          </div>
        )}
      </section>

      {hasFamilyMemories || memoriesShared.length > 0 ? (
        <section className="home-shelf" aria-labelledby="home-shared-title">
          <div className="home-shelf-header">
            <div>
              <h2 id="home-shared-title" className="home-shelf-title">
                Shared with family
              </h2>
              <p className="home-shelf-lead">Albums from people you trust.</p>
            </div>
            <Link href="/memories" className="home-shelf-link">
              View shared
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
              Recent photos
            </h2>
            <p className="home-shelf-lead">
              Ready for albums and movies.
            </p>
          </div>
          <div className="home-shelf-links">
            <Link href="/movies" className="home-shelf-link">
              <Clapperboard className="size-3.5" aria-hidden />
              Movies
            </Link>
            <Link href="/media" className="home-shelf-link">
              All photos
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
        {hasPhotos ? (
          <MediaGallery items={mediaOwn} />
        ) : (
          <div className="home-empty">
            <p className="home-empty-title">Add your first photos</p>
            <p className="home-empty-copy">
              Upload from your phone or computer. We’ll keep them private until
              they’re ready.
            </p>
            <Link href="/upload" className="ui-btn ui-btn-primary">
              <Upload className="size-4" aria-hidden />
              Upload photos
            </Link>
          </div>
        )}
      </section>

      {hasFamilyMedia || mediaShared.length > 0 ? (
        <section className="home-shelf" aria-labelledby="home-family-photos">
          <div className="home-shelf-header">
            <div>
              <h2 id="home-family-photos" className="home-shelf-title">
                Family photos
              </h2>
              <p className="home-shelf-lead">From people you trust.</p>
            </div>
          </div>
          <MediaGallery
            items={mediaShared}
            emptyTitle={COPY.empty.mediaShared.title}
            emptyDescription={COPY.empty.mediaShared.description}
            emptyActionHref={null}
          />
        </section>
      ) : null}

      <details className="home-account-details">
        <summary className="home-account-summary">Plan & storage</summary>
        <div className="home-account-panel app-overview">
          <CurrentPlanBadge
            planName={usage.planName}
            planSlug={usage.planSlug}
            billingInterval={usage.billingInterval}
            canManageBilling={usage.canManageBilling}
            stripeConfigured={stripeConfigured}
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
}: Omit<DashboardHomeModernProps, "displayName">) {
  return (
    <>
      <AppPageIntro
        slot="dashboard"
        title="Your vault"
        description="A calm home for your photos, albums, and family shares."
        actions={
          <>
            <Link href="/memories/new" className="ui-btn ui-btn-secondary">
              <Plus className="size-4 text-accent-deep" aria-hidden />
              Create a memory
            </Link>
            <Link href="/upload" className="ui-btn ui-btn-primary">
              <Upload className="size-4" aria-hidden />
              Add photos
            </Link>
          </>
        }
      />

      <div className="app-page app-stack mx-auto max-w-6xl">
      {onboarding.show ? (
        <OnboardingChecklist progress={onboarding} />
      ) : null}

      <section className="app-overview" aria-label="Plan and storage">
        <UsageLimitBanner summary={usage} />
        <CurrentPlanBadge
          planName={usage.planName}
          planSlug={usage.planSlug}
          billingInterval={usage.billingInterval}
          canManageBilling={usage.canManageBilling}
          stripeConfigured={stripeConfigured}
        />
        <StorageUsageCard snapshot={usage.storage} variant="compact" />
        <ReviewStatusBanner summary={reviewSummary} />
      </section>

      <LibrarySection
        title="My memories"
        description="Albums you created recently."
        count={memoriesOwn.length}
        actions={
          <Link
            href="/memories"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep transition hover:text-accent"
          >
            View all
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
          title="Shared with family"
          description="Recent albums from your family."
          count={memoriesShared.length}
          variant="shared"
          actions={
            <Link
              href="/memories"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep transition hover:text-accent"
            >
              View all
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
        title="Your photos"
        description="Your recent photos and videos."
        count={mediaOwn.length}
        actions={
          <Link
            href="/media"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep transition hover:text-accent"
          >
            View all
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      >
        <MediaGallery items={mediaOwn} />
      </LibrarySection>

      {hasFamilyMedia || mediaShared.length > 0 ? (
        <LibrarySection
          title="Shared with family"
          description="Recent photos from your family."
          count={mediaShared.length}
          variant="shared"
          actions={
            <Link
              href="/media"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-deep transition hover:text-accent"
            >
              View all
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        >
          <MediaGallery
            items={mediaShared}
            emptyTitle={COPY.empty.mediaShared.title}
            emptyDescription={COPY.empty.mediaShared.description}
            emptyActionHref={null}
          />
        </LibrarySection>
      ) : null}
    </div>
    </>
  );
}
