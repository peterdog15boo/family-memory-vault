import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AccountUsageOverview } from "@/components/billing/AccountUsageOverview";
import { CurrentPlanBadge } from "@/components/billing/CurrentPlanBadge";
import { PricingGrid } from "@/components/billing/PricingGrid";
import { UsageLimitBanner } from "@/components/billing/UsageLimitBanner";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { getAccountUsageSummary } from "@/lib/billing/account-usage";
import {
  isBetaBillingOverride,
  isBetaPlanPickerEnabled,
} from "@/lib/billing/beta-flags";
import { ensureFreeSubscription } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { ensureAppUser } from "@/lib/users";

type PageProps = {
  searchParams: Promise<{ billing?: string }>;
};

export default async function BillingPage({ searchParams }: PageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  await ensureAppUser(userId);
  await ensureFreeSubscription(userId);

  const [{ billing }, summary] = await Promise.all([
    searchParams,
    getAccountUsageSummary(userId),
  ]);

  const billingNotice =
    billing === "success"
      ? "Thanks — your subscription will update in a moment once Stripe confirms payment."
      : billing === "cancel"
        ? "Checkout canceled. You can upgrade anytime."
        : billing === "portal"
          ? "Welcome back from the billing portal."
          : null;

  const stripeConfigured = isStripeConfigured();
  const betaMode = isBetaPlanPickerEnabled() || isBetaBillingOverride();

  return (
    <>
      <AppPageIntro
        slot="billing"
        compact
        title="Billing & usage"
        description={
          betaMode
            ? "Switch plans freely while we beta-test. Prices are shown for context — no payment is collected."
            : "See what's included in your plan, how much you've used, and upgrade when you need more room for memories."
        }
      />

      <div className="app-page mx-auto max-w-3xl">
        <div className="app-stack space-y-6">
          <CurrentPlanBadge
            planName={summary.planName}
            planSlug={summary.planSlug}
            billingInterval={summary.billingInterval}
            planSource={summary.planSource}
            canManageBilling={summary.canManageBilling}
            stripeConfigured={stripeConfigured}
          />

          {billingNotice ? (
            <p className="rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent-deep">
              {billingNotice}
            </p>
          ) : null}

          <UsageLimitBanner summary={summary} />

          <AccountUsageOverview summary={summary} />

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg tracking-tight text-ink">
                  {betaMode ? "Choose a beta plan" : "Change plan"}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {betaMode
                    ? "Feature limits update immediately. You will not be charged."
                    : "Compare limits and upgrade securely with Stripe."}
                </p>
              </div>
              <Link
                href="/pricing"
                className="shrink-0 text-sm font-medium text-accent-deep hover:text-accent"
              >
                Full pricing page
              </Link>
            </div>
            <PricingGrid
              variant="embedded"
              currentPlanSlug={summary.planSlug}
              isSignedIn
              stripeConfigured={stripeConfigured}
              canManageBilling={summary.canManageBilling}
            />
          </section>

          <p className="text-sm text-ink-muted">
            Need help choosing a plan?{" "}
            <Link
              href="/settings"
              className="font-medium text-accent-deep hover:text-accent"
            >
              Account settings
            </Link>{" "}
            has family sharing and other preferences.
          </p>
        </div>
      </div>
    </>
  );
}
