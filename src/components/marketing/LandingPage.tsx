"use client";

import { useLayoutEffect, useState } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  APP_THEME_DEFAULT,
  readDomTheme,
  readStoredTheme,
  type AppTheme,
} from "@/lib/theme/types";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LandingModern } from "@/components/marketing/LandingModern";
import { LandingOriginal } from "@/components/marketing/LandingOriginal";
import { CinematicSection } from "@/components/cinematic";
import { LANDING_MEDIA } from "@/content/landing-media";

/**
 * Theme-aware public landing.
 * Resolves Modern/Original from the DOM boot theme before painting so Modern
 * never flashes the Original landing composition.
 */
export function LandingPage() {
  const { theme, ready } = useTheme();
  const [effective, setEffective] = useState<AppTheme | null>(null);

  useLayoutEffect(() => {
    if (ready) {
      setEffective(theme);
      return;
    }
    setEffective(readDomTheme() ?? readStoredTheme() ?? APP_THEME_DEFAULT);
  }, [theme, ready]);

  if (effective === null) {
    return (
      <CinematicSection
        mediaType="image"
        src={LANDING_MEDIA.hero.image}
        poster={LANDING_MEDIA.hero.image}
        overlay="hero-cinematic"
        layout="center"
        priority
        viewport
        className="landing-stage landing-hero"
        contentClassName="landing-stage-content"
        imageAlt={LANDING_MEDIA.hero.alt}
      >
        <p className="landing-hero-brand text-white">
          <BrandLogo tone="onDark" size="hero" priority />
        </p>
      </CinematicSection>
    );
  }

  if (effective === "modern") {
    return <LandingModern />;
  }

  return <LandingOriginal />;
}
