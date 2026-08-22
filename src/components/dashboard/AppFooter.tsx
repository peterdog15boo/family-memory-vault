"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CinematicBackdrop } from "@/components/cinematic/CinematicBackdrop";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { APP_FOOTER_MEDIA } from "@/content/page-hero-media";

type AppFooterProps = {
  /** Documents / Connected Accounts — Legacy+ only. */
  showLegacyPlusNav?: boolean;
};

/**
 * Modern app footer — restrained full-bleed cinematic close with brand,
 * warm tagline, and useful vault links. Original theme does not render this.
 */
export function AppFooter({ showLegacyPlusNav = false }: AppFooterProps) {
  const year = new Date().getFullYear();
  const t = useTranslations();
  const footerLinks = [
    { href: "/settings", label: t("nav.settings") },
    { href: "/family", label: t("nav.family") },
    { href: "/family-memory-box", label: t("nav.digitize") },
    ...(showLegacyPlusNav
      ? [
          { href: "/documents", label: t("nav.documents") },
          { href: "/accounts", label: t("nav.accounts") },
        ]
      : []),
    { href: "/memories", label: t("nav.memories") },
    { href: "/privacy", label: t("nav.privacy") },
    { href: "/terms", label: t("nav.terms") },
  ] as const;

  return (
    <footer className="app-footer w-full" aria-label={t("nav.footer")}>
      <div className="app-footer-stage">
        <CinematicBackdrop
          mediaType="image"
          src={APP_FOOTER_MEDIA.image}
          overlay="hero-veil"
          atmosphere="warm"
          mediaFilter="soft"
          imageAlt={APP_FOOTER_MEDIA.alt}
          priority={false}
        />

        <div className="app-footer-inner">
          <div className="app-footer-brand">
            <Link
              href="/dashboard"
              className="app-footer-logo"
              aria-label={t("meta.appName")}
            >
              <BrandLogo tone="color" size="lg" decorative />
            </Link>
            <p className="app-footer-tagline">{t("meta.tagline")}</p>
          </div>

          <nav className="app-footer-links" aria-label={t("nav.footer")}>
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="app-footer-meta flex flex-col items-end gap-2">
            <LanguageSwitcher compact />
            <p>{t("nav.copyright", { year })}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
