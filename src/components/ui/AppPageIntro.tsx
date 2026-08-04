"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageHero } from "@/components/ui/PageHero";
import type { PageHeroSlotId } from "@/content/page-hero-media";
import { cn } from "@/lib/utils";

export type AppPageIntroProps = {
  slot: PageHeroSlotId;
  title: ReactNode;
  description?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Content only on Original intro (e.g. privacy notes) */
  originalExtra?: ReactNode;
  /** Content on Modern hero stage under actions */
  modernExtra?: ReactNode;
  className?: string;
  showBrand?: boolean;
  compact?: boolean;
  priority?: boolean;
};

/**
 * Theme fork for authenticated page intros.
 * Modern → {@link PageHero} in the main column; Original → classic {@link PageHeader}.
 */
export function AppPageIntro({
  slot,
  title,
  description,
  eyebrow,
  actions,
  originalExtra,
  modernExtra,
  className,
  showBrand = false,
  compact = false,
  priority = true,
}: AppPageIntroProps) {
  const { isModern } = useTheme();

  if (isModern) {
    return (
      <PageHero
        slot={slot}
        title={title}
        description={description}
        eyebrow={eyebrow}
        actions={actions}
        showBrand={showBrand}
        priority={priority}
        className={className}
      >
        {modernExtra}
      </PageHero>
    );
  }

  return (
    <section
      className={cn(
        "app-intro mx-auto w-full max-w-6xl",
        `app-intro--${slot}`,
        className,
      )}
    >
      {eyebrow ? <p className="app-intro-eyebrow">{eyebrow}</p> : null}
      <PageHeader
        className={eyebrow ? "mt-2" : undefined}
        title={title}
        description={description}
        actions={actions}
        compact={compact}
      />
      {originalExtra}
    </section>
  );
}
