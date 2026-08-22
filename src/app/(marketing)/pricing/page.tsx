import { auth } from "@clerk/nextjs/server";
import { PricingPageView } from "@/components/marketing/PricingPageView";
import {
  isBetaBillingOverride,
  isBetaPlanPickerEnabled,
} from "@/lib/billing/beta-flags";
import { ensureFreeSubscription, getUserPlan } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { ensureAppUser } from "@/lib/users";

export const metadata = {
  title: "Pricing — Family Memory Vault",
  description:
    "Free, Family, and Family Plus plans for a private, family-safe memory vault.",
};

/**
 * Public pricing page — theme-forked via PricingPageView
 * (Modern cinematic vs Original classic).
 */
export default async function PricingPage() {
  const { userId, isAuthenticated } = await auth();
  let currentPlanSlug: string | null = null;
  let canManageBilling = false;

  if (isAuthenticated && userId) {
    await ensureAppUser(userId);
    await ensureFreeSubscription(userId);
    const planCtx = await getUserPlan(userId);
    currentPlanSlug = String(planCtx.plan.slug);
    canManageBilling = Boolean(
      planCtx.subscription?.stripeCustomerId ||
        planCtx.subscription?.stripeSubscriptionId,
    );
  }

  const betaMode = isBetaPlanPickerEnabled() || isBetaBillingOverride();

  return (
    <PricingPageView
      currentPlanSlug={currentPlanSlug}
      isSignedIn={Boolean(isAuthenticated && userId)}
      canManageBilling={canManageBilling}
      stripeConfigured={isStripeConfigured()}
      betaMode={betaMode}
    />
  );
}
