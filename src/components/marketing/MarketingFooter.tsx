"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { isAppTheme, type AppTheme } from "@/lib/theme/types";

/**
 * Quiet marketing footer — theme-aware links so Modern never points
 * at Original-only anchors (and vice versa).
 */
export function MarketingFooter() {
  const year = new Date().getFullYear();
  const { theme, ready } = useTheme();
  const t = useTranslations();
  const [domTheme, setDomTheme] = useState<AppTheme | null>(null);

  useLayoutEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (isAppTheme(attr)) setDomTheme(attr);
  }, [theme]);

  const effective: AppTheme = ready ? theme : (domTheme ?? "original");
  const modern = effective === "modern";

  const links = modern
    ? [
        { href: "/#promise", label: t("nav.preserve") },
        { href: "/family-memory-box", label: t("nav.digitize") },
        { href: "/privacy", label: t("nav.privacy") },
        { href: "/terms", label: t("nav.terms") },
        { href: "/pricing", label: t("nav.pricing") },
      ]
    : [
        { href: "/privacy", label: t("nav.privacy") },
        { href: "/terms", label: t("nav.terms") },
        { href: "/#how-it-works", label: t("nav.howItWorks") },
        { href: "/family-memory-box", label: t("nav.digitize") },
        { href: "/pricing", label: t("nav.pricing") },
      ];

  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-inner">
        <div className="marketing-footer-brand">
          {modern ? (
            <BrandLogo tone="color" size="md" />
          ) : (
            <p className="marketing-footer-name">{t("meta.appName")}</p>
          )}
          <p className="marketing-footer-tagline">
            {t("meta.tagline")}
          </p>
        </div>

        <nav className="marketing-footer-links" aria-label={t("nav.footer")}>
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="marketing-footer-copy flex flex-col items-end gap-2">
          <LanguageSwitcher compact />
          <p>{t("nav.copyrightYear", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
