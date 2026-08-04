"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { landingContent } from "@/content/landing";
import { CinematicSection } from "@/components/cinematic";

/**
 * Full-viewport cinematic hero — centered emotional statement over media,
 * floating header above, gentle cue into the next stage.
 */
export function LandingHero() {
  const { hero } = landingContent;
  // Prefer the photographic still for Modern — the tiny loop washes out to a
  // soft gradient under cinematic veils and fails the “real media” bar.
  const mediaType = hero.backgroundImage ? "image" : "none";

  return (
    <CinematicSection
      treatment={hero.treatment}
      mediaType={mediaType}
      src={hero.backgroundImage}
      poster={hero.backgroundImageFallback ?? hero.backgroundImage}
      overlay={hero.overlay}
      layout="center"
      mediaFilter="clear"
      priority
      viewport
      className="landing-stage landing-hero landing-hero--cinematic"
      contentClassName="landing-stage-content landing-hero-content"
      imageAlt="Family gathered at sunset by the water"
    >
        <div className="landing-hero-center cinematic-hero-copy">
        <p className="animate-fade-up landing-hero-brand">
          <BrandLogo tone="onDark" size="hero" priority />
        </p>
        <h1 className="animate-fade-up-delay-1 landing-hero-headline">
          {hero.headline}
        </h1>
        <p className="animate-fade-up-delay-2 landing-hero-support">
          {hero.support}
        </p>
        <div className="animate-fade-up-delay-3 landing-hero-actions">
          <Link
            href={hero.primaryCta.href}
            className="ui-btn ui-btn-primary ui-btn-lg landing-cta-primary"
          >
            {hero.primaryCta.label}
          </Link>
          <Link
            href={hero.secondaryCta.href}
            className="ui-btn ui-btn-ghost ui-btn-lg landing-cta-ghost-on-media"
          >
            {hero.secondaryCta.label}
          </Link>
        </div>
      </div>

      <a
        href={hero.scrollHref}
        className="landing-hero-scroll"
        aria-label={hero.scrollLabel}
      >
        <span className="landing-hero-scroll-label">{hero.scrollLabel}</span>
        <ChevronDown className="landing-hero-scroll-icon" aria-hidden />
      </a>
    </CinematicSection>
  );
}
