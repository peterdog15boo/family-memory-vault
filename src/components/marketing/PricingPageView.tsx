"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { PricingGrid } from "@/components/billing/PricingGrid";
import { CinematicSection } from "@/components/cinematic";
import { useTheme } from "@/components/theme/ThemeProvider";
import { LANDING_MEDIA } from "@/content/landing-media";
import { isAppTheme, type AppTheme } from "@/lib/theme/types";

type PricingPageViewProps = {
  currentPlanSlug: string | null;
  isSignedIn: boolean;
  canManageBilling: boolean;
  stripeConfigured: boolean;
};

/**
 * Theme-forked public pricing:
 * - Modern → cinematic intro + calm plan grid (no SaaS blur-orb hero)
 * - Original → classic marketing pricing layout
 */
export function PricingPageView({
  currentPlanSlug,
  isSignedIn,
  canManageBilling,
  stripeConfigured,
}: PricingPageViewProps) {
  const { theme, ready } = useTheme();
  const [domTheme, setDomTheme] = useState<AppTheme | null>(null);

  useLayoutEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (isAppTheme(attr)) setDomTheme(attr);
  }, [theme]);

  const effective: AppTheme = ready ? theme : (domTheme ?? "original");

  if (effective === "modern") {
    return (
      <div className="pricing-modern">
        <CinematicSection
          mediaType="image"
          src={LANDING_MEDIA.privacy.image}
          poster={LANDING_MEDIA.privacy.image}
          overlay="hero-cinematic"
          layout="center"
          viewport
          priority
          className="pricing-modern-hero"
          contentClassName="pricing-modern-hero-content"
          imageAlt={LANDING_MEDIA.privacy.alt}
        >
          <p className="pricing-modern-eyebrow">Plans</p>
          <h1 className="pricing-modern-title">
            Room for your family’s story
          </h1>
          <p className="pricing-modern-support">
            Start free. Upgrade when you need more space, seats, and movies —
            privacy stays first on every plan.
          </p>
          <div className="pricing-modern-actions">
            <a href="#plans" className="ui-btn ui-btn-primary ui-btn-lg">
              Compare plans
            </a>
            <Link
              href={isSignedIn ? "/dashboard" : "/sign-up"}
              className="ui-btn ui-btn-ghost ui-btn-lg landing-cta-ghost-on-media"
            >
              {isSignedIn ? "Open vault" : "Begin your vault"}
            </Link>
          </div>
        </CinematicSection>

        <section id="plans" className="pricing-modern-plans">
          <div className="pricing-modern-plans-intro">
            <h2 className="pricing-modern-plans-title">
              Choose what fits your household
            </h2>
            <p className="pricing-modern-plans-lead">
              Clear limits for storage, family members, and movies. No ads. No
              public profiles.
            </p>
          </div>

          <PricingGrid
            className="mt-10"
            currentPlanSlug={currentPlanSlug}
            isSignedIn={isSignedIn}
            stripeConfigured={stripeConfigured}
            canManageBilling={canManageBilling}
          />
        </section>

        <section className="pricing-modern-safety">
          <h2 className="pricing-modern-safety-title">
            Safety included on every plan
          </h2>
          <p className="pricing-modern-safety-lead">
            Uploads are looked over before they can appear in shared family
            spaces — never a marketplace add-on.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-atmosphere pricing-original">
      <section className="relative overflow-hidden border-b border-ink/8">
        <div
          className="pointer-events-none absolute -right-24 top-0 size-72 rounded-full bg-accent/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-16 bottom-0 size-64 rounded-full bg-[#c4a574]/12 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pb-20 sm:pt-20">
          <p className="animate-fade-up font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Family Memory Vault
          </p>
          <h1 className="animate-fade-up-delay-1 mt-5 max-w-2xl text-balance font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
            Plans that grow with your family’s story
          </h1>
          <p className="animate-fade-up-delay-2 mt-5 max-w-lg text-pretty text-base leading-relaxed text-ink-muted sm:text-lg">
            Start free. Upgrade when you need more storage, household seats, and
            movies — privacy and safety stay first on every plan.
          </p>
          <div className="animate-fade-up-delay-3 mt-8 flex flex-wrap gap-3">
            <a
              href="#plans"
              className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep"
            >
              Compare plans
            </a>
            <Link
              href={isSignedIn ? "/dashboard" : "/sign-up"}
              className="rounded-md px-5 py-3 text-sm font-medium text-ink-muted transition hover:bg-ink/5 hover:text-ink"
            >
              {isSignedIn ? "Back to vault" : "Start free"}
            </Link>
          </div>
        </div>
      </section>

      <section id="plans" className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Choose what fits your household
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ink-muted">
            Transparent limits for storage, family members, and movie
            generation. No ads. No public profiles.
          </p>
        </div>

        <PricingGrid
          className="mt-12"
          currentPlanSlug={currentPlanSlug}
          isSignedIn={isSignedIn}
          stripeConfigured={stripeConfigured}
          canManageBilling={canManageBilling}
        />
      </section>

      <section className="border-t border-ink/8 bg-canvas-deep/50">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center">
          <h2 className="font-display text-xl tracking-tight text-ink sm:text-2xl">
            Safety included on every plan
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Uploads are moderated before they can appear in shared family
            spaces. Suspected harmful content is quarantined — never a
            marketplace add-on.
          </p>
        </div>
      </section>
    </div>
  );
}
