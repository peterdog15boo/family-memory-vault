"use client";

import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CinematicBackdrop } from "@/components/cinematic/CinematicBackdrop";
import {
  getPageHeroMedia,
  type PageHeroSlotId,
} from "@/content/page-hero-media";
import { cn } from "@/lib/utils";

export type PageHeroProps = {
  slot: PageHeroSlotId;
  title: ReactNode;
  description?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  showBrand?: boolean;
  priority?: boolean;
};

/**
 * Modern page hero — image, soft veil, title cluster, optional CTAs.
 * Lives in the main content column (not above the sidebar).
 */
export function PageHero({
  slot,
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  showBrand = false,
  priority = true,
}: PageHeroProps) {
  const media = getPageHeroMedia(slot);

  return (
    <header
      className={cn("app-page-hero", `app-page-hero--${slot}`, className)}
      data-hero-slot={slot}
    >
      <div className="app-page-hero-stage">
        <CinematicBackdrop
          mediaType="image"
          src={media.image}
          overlay="hero-veil"
          atmosphere="warm"
          mediaFilter="soft"
          imageAlt={media.alt}
          priority={priority}
        />

        <div className="app-page-hero-inner">
          {showBrand ? (
            <p className="app-page-hero-brand">
              <BrandLogo tone="color" size="sm" priority={priority} />
            </p>
          ) : null}
          {eyebrow ? (
            <p className="app-page-hero-eyebrow">{eyebrow}</p>
          ) : null}
          <h1 className="app-page-hero-title">{title}</h1>
          {description ? (
            <p className="app-page-hero-lead">{description}</p>
          ) : null}
          {actions ? (
            <div className="app-page-hero-actions">{actions}</div>
          ) : null}
          {children ? (
            <div className="app-page-hero-extra">{children}</div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
