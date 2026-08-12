"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { AuthVisualCollage } from "@/components/auth/AuthVisualCollage";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CinematicSection } from "@/components/cinematic";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { LANDING_MEDIA } from "@/content/landing-media";
import {
  APP_THEME_DEFAULT,
  readDomTheme,
  readStoredTheme,
  type AppTheme,
} from "@/lib/theme/types";

function resolveClientTheme(theme: AppTheme, ready: boolean): AppTheme {
  if (ready) return theme;
  return readDomTheme() ?? readStoredTheme() ?? APP_THEME_DEFAULT;
}

/**
 * Theme-forked auth shell:
 * - Modern → full-bleed cinematic welcome (image/video)
 * - Original → classic split collage + form
 *
 * Avoids SSR flash of the wrong shell by resolving theme from the DOM boot
 * script on the client before painting the forked UI.
 */
export function AuthPageShell({
  children,
  eyebrow,
  title,
  support,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  support: string;
}) {
  const { theme, ready } = useTheme();
  const [effective, setEffective] = useState<AppTheme | null>(null);

  useLayoutEffect(() => {
    setEffective(resolveClientTheme(theme, ready));
  }, [theme, ready]);

  // Pre-mount: warm photographic shell — never an empty gray frame,
  // never the Original collage when Modern is active.
  if (effective === null) {
    return (
      <AuthCinematicFrame eyebrow={eyebrow} title={title} support={support}>
        {children}
      </AuthCinematicFrame>
    );
  }

  if (effective === "original") {
    return (
      <AuthOriginalFrame eyebrow={eyebrow} title={title} support={support}>
        {children}
      </AuthOriginalFrame>
    );
  }

  return (
    <AuthCinematicFrame eyebrow={eyebrow} title={title} support={support}>
      {children}
    </AuthCinematicFrame>
  );
}

function AuthOriginalFrame({
  children,
  eyebrow,
  title,
  support,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  support: string;
}) {
  const t = useTranslations();

  return (
    <div className="auth-page">
      <aside className="auth-page-media">
        <AuthVisualCollage />
        <div className="auth-page-media-copy">
          <p className="auth-page-eyebrow">{eyebrow}</p>
          <h1 className="auth-page-media-title">{title}</h1>
          <p className="auth-page-media-support">{support}</p>
        </div>
      </aside>

      <div className="auth-page-form">
        <div className="auth-page-form-inner">
          <div className="mb-5 flex justify-end">
            <LanguageSwitcher compact />
          </div>
          <div className="mb-6 lg:hidden">
            <p className="auth-page-eyebrow">{eyebrow}</p>
            <h1 className="mt-2 font-display text-2xl tracking-tight text-ink">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {support}
            </p>
          </div>
          {children}
          <p className="mt-6 text-center text-sm text-ink-muted">
            <Link
              href="/"
              className="font-medium text-accent-deep hover:underline"
            >
              {t("pages.backToHome")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function AuthCinematicFrame({
  children,
  eyebrow,
  title,
  support,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  support: string;
}) {
  const t = useTranslations();
  // Dedicated photographic still — not the soft hero loop, which reads as a
  // gradient under dark veils and fails the “real full-bleed image” bar.
  const photo = LANDING_MEDIA.signIn.image;

  return (
    <CinematicSection
      as="div"
      mediaType="image"
      src={photo}
      poster={photo}
      overlay="dark"
      layout="fill"
      atmosphere="legacy"
      mediaFilter="clear"
      priority
      viewport
      className="auth-cinematic auth-cinematic--modern"
      contentClassName="auth-cinematic-inner"
      imageAlt={LANDING_MEDIA.signIn.alt}
    >
      <header className="auth-cinematic-top">
        <Link
          href="/"
          className="auth-cinematic-brand"
          aria-label={t("meta.appName")}
        >
          <BrandLogo tone="onDark" size="lg" priority decorative />
        </Link>
        <div className="auth-cinematic-top-actions flex items-center gap-3">
          <LanguageSwitcher compact tone="onDark" />
          <Link href="/" className="auth-cinematic-home">
            {t("pages.backToHome")}
          </Link>
        </div>
      </header>

      <div className="auth-cinematic-stage">
        <div className="auth-cinematic-copy">
          <p className="auth-cinematic-eyebrow">{eyebrow}</p>
          <h1 className="auth-cinematic-title">{title}</h1>
          <p className="auth-cinematic-support">{support}</p>
        </div>

        <div className="auth-cinematic-card">{children}</div>
      </div>
    </CinematicSection>
  );
}
