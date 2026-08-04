import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { syncCheckoutSessionForUser } from "@/lib/stripe/sync-checkout";
import { getUserPlan } from "@/lib/plans";
import { isStripeConfigured } from "@/lib/stripe";
import { ensureAppUser } from "@/lib/users";

type PageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

export const metadata = {
  title: "Welcome — Family Memory Vault",
};

/**
 * Post-checkout success — syncs Stripe session into `subscriptions`, then
 * shows the refreshed plan.
 */
export default async function PricingSuccessPage({ searchParams }: PageProps) {
  const { session_id: sessionId } = await searchParams;
  const { userId, isAuthenticated } = await auth();

  if (!isAuthenticated || !userId) {
    const next = sessionId
      ? `/pricing/success?session_id=${encodeURIComponent(sessionId)}`
      : "/pricing/success";
    redirect(`/sign-in?redirect_url=${encodeURIComponent(next)}`);
  }

  await ensureAppUser(userId);

  let syncNote: string | null = null;
  if (sessionId && isStripeConfigured()) {
    try {
      await syncCheckoutSessionForUser(userId, sessionId);
      syncNote = "Your subscription is active.";
    } catch (error) {
      console.error("[pricing.success] sync failed", error);
      syncNote =
        "Payment received — your plan may take a moment to update if the webhook is still catching up.";
    }
  } else if (!sessionId) {
    syncNote = "Thanks for upgrading.";
  }

  const planCtx = await getUserPlan(userId);

  return (
    <div className="page-atmosphere">
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 py-20 text-center">
        <span className="animate-fade-up rounded-full bg-accent/15 p-3 text-accent-deep">
          <CheckCircle2 className="size-8" aria-hidden />
        </span>
        <p className="animate-fade-up-delay-1 mt-6 font-display text-2xl tracking-tight text-ink sm:text-3xl">
          Family Memory Vault
        </p>
        <h1 className="animate-fade-up-delay-2 mt-4 font-display text-3xl tracking-tight text-ink">
          You’re on {planCtx.plan.name}
        </h1>
        <p className="animate-fade-up-delay-3 mt-4 text-base leading-relaxed text-ink-muted">
          {syncNote} Enjoy the extra room for your family’s memories.
        </p>

        <div className="animate-fade-up-delay-3 mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep"
          >
            Go to your vault
          </Link>
          <Link
            href="/billing"
            className="rounded-md px-5 py-3 text-sm font-medium text-ink-muted transition hover:bg-ink/5 hover:text-ink"
          >
            Manage billing
          </Link>
        </div>
      </div>
    </div>
  );
}
