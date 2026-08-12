"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { isAppTheme, type AppTheme } from "@/lib/theme/types";
import { cn } from "@/lib/utils";

/**
 * Public marketing navigation — sticky, translucent over media, solid on scroll.
 * Theme-aware links so Original ↔ Modern never point at missing anchors.
 */
export function MarketingNav() {
  const pathname = usePathname();
  const { theme, ready } = useTheme();
  const t = useTranslations();
  const [domTheme, setDomTheme] = useState<AppTheme | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const modernNavLinks = [
    { href: "/#promise", label: t("nav.preserve") },
    { href: "/#privacy", label: t("nav.privacy") },
    { href: "/#legacy", label: t("nav.legacy") },
    { href: "/family-memory-box", label: t("nav.digitize") },
  ] as const;
  const originalNavLinks = [
    { href: "/#privacy", label: t("nav.privacy") },
    { href: "/#how-it-works", label: t("nav.howItWorks") },
    { href: "/family-memory-box", label: t("nav.digitize") },
    { href: "/pricing", label: t("nav.pricing") },
  ] as const;

  useLayoutEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (isAppTheme(attr)) setDomTheme(attr);
  }, [theme]);

  const effective: AppTheme = ready ? theme : (domTheme ?? "original");
  const modern = effective === "modern";
  const navLinks = modern ? modernNavLinks : originalNavLinks;
  const isLanding = pathname === "/" || pathname === "";
  const overMedia = modern && isLanding && !scrolled;

  useEffect(() => {
    const sync = () => setScrolled(window.scrollY > 28);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  return (
    <header
      className={cn(
        "marketing-nav",
        modern && "marketing-nav--modern",
        scrolled ? "marketing-nav--solid" : "marketing-nav--over-media",
      )}
    >
      <div className="marketing-nav-inner">
        <Link
          href="/"
          className="marketing-nav-brand"
          aria-label={t("meta.appName")}
        >
          {modern ? (
            <BrandLogo
              tone={overMedia ? "onDark" : "color"}
              size="lg"
              priority
              decorative
            />
          ) : (
            t("meta.appName")
          )}
        </Link>

        <nav className="marketing-nav-links" aria-label={t("nav.marketing")}>
          {navLinks.map((link) => {
            const active =
              (link.href === "/pricing" && pathname.startsWith("/pricing")) ||
              (link.href === "/family-memory-box" &&
                (pathname.startsWith("/family-memory-box") ||
                  pathname.startsWith("/digitize")));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "marketing-nav-link",
                  active && "marketing-nav-link--active",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="marketing-nav-actions">
          <LanguageSwitcher compact />
          <Show when="signed-out">
            <Link href="/sign-in" className="marketing-nav-signin">
              {t("nav.signIn")}
            </Link>
            <Link href="/sign-up" className="marketing-nav-cta">
              {modern ? t("nav.beginVault") : t("nav.startPreserving")}
            </Link>
          </Show>
          <Show when="signed-in">
            <FeedbackButton
              placement="header"
              className={cn(
                "marketing-nav-feedback",
                overMedia && "marketing-nav-feedback--on-dark",
              )}
            />
            <Link href="/dashboard" className="marketing-nav-signin">
              {modern ? t("nav.openVault") : t("nav.goToVault")}
            </Link>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "size-8",
                },
              }}
            />
          </Show>
        </div>
      </div>
    </header>
  );
}
