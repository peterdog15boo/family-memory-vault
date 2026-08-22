import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardHome } from "@/components/dashboard/DashboardHomeGate";
import { getAccountUsageSummary } from "@/lib/billing/account-usage";
import { getFamilyCompleteness } from "@/lib/completeness/family-completeness";
import {
  getMediaReviewSummary,
  getSafeMediaLibrary,
} from "@/lib/media/queries";
import {
  countOnThisDayForUser,
  onThisDayLabelFor,
} from "@/lib/media/on-this-day";
import { listMemoryLibrary } from "@/lib/memories";
import { getOnboardingProgress } from "@/lib/onboarding";
import { ensureFreeSubscription } from "@/lib/plans";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";
import { isStripeConfigured } from "@/lib/stripe";
import {
  emptyJourneyBoard,
  getUserJourney,
  journeyBoardFromJourney,
} from "@/lib/gamification";
import { ensureAppUser } from "@/lib/users";

export default async function DashboardPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  await ensureFreeSubscription(userId);

  const [
    mediaLibrary,
    reviewSummary,
    memoryLibrary,
    usage,
    onboarding,
    user,
    journey,
    onThisDayCount,
    completeness,
    legacyPlusGate,
  ] = await Promise.all([
    getSafeMediaLibrary(userId, { ownLimit: 12, sharedLimit: 12 }),
    getMediaReviewSummary(userId),
    listMemoryLibrary(userId, { ownLimit: 6, sharedLimit: 6 }),
    getAccountUsageSummary(userId),
    getOnboardingProgress(userId),
    currentUser().catch(() => null),
    getUserJourney(userId).catch(() => null),
    countOnThisDayForUser(userId),
    getFamilyCompleteness(userId),
    canUseLegacyPlusFeatures(userId).catch(() => ({ allowed: false as const })),
  ]);

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "there";

  const legacyHref = legacyPlusGate.allowed ? "/legacy" : "/billing";

  return (
    <DashboardHome
      displayName={displayName}
      mediaOwn={mediaLibrary.own}
      mediaShared={mediaLibrary.shared}
      hasFamilyMedia={mediaLibrary.hasFamilySharing}
      memoriesOwn={memoryLibrary.own}
      memoriesShared={memoryLibrary.shared}
      hasFamilyMemories={memoryLibrary.hasFamilySharing}
      reviewSummary={reviewSummary}
      usage={usage}
      onboarding={onboarding}
      stripeConfigured={isStripeConfigured()}
      journeyBoard={
        journey
          ? journeyBoardFromJourney(journey, { legacyHref })
          : emptyJourneyBoard({ legacyHref })
      }
      completeness={completeness}
      onThisDayCount={onThisDayCount}
      onThisDayLabel={onThisDayLabelFor()}
    />
  );
}
