import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardHome } from "@/components/dashboard/DashboardHomeGate";
import { getAccountUsageSummary } from "@/lib/billing/account-usage";
import {
  getMediaReviewSummary,
  getSafeMediaLibrary,
} from "@/lib/media/queries";
import { listMemoryLibrary } from "@/lib/memories";
import { getOnboardingProgress } from "@/lib/onboarding";
import { ensureFreeSubscription } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { ensureAppUser } from "@/lib/users";

export default async function DashboardPage() {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  await ensureFreeSubscription(userId);

  const [mediaLibrary, reviewSummary, memoryLibrary, usage, onboarding, user] =
    await Promise.all([
      getSafeMediaLibrary(userId, { ownLimit: 12, sharedLimit: 12 }),
      getMediaReviewSummary(userId),
      listMemoryLibrary(userId, { ownLimit: 6, sharedLimit: 6 }),
      getAccountUsageSummary(userId),
      getOnboardingProgress(userId),
      currentUser().catch(() => null),
    ]);

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "there";

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
    />
  );
}
