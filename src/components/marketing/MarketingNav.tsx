"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useTheme } from "@/components/theme/ThemeProvider";
import { isAppTheme, type AppTheme } from "@/lib/theme/types";
import { cn } from "@/lib/utils";

const MODERN_NAV_LINKS = [
  { href: "/#promise", label: "Preserve" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/#legacy", label: "Legacy" },
] as const;

const ORIGINAL_NAV_LINKS = [
  { href: "/#privacy", label: "Privacy" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
] as const;

/**
 * Public marketing navigation — sticky, translucent over media, solid on scroll.
 * Theme-aware links so Original ↔ Modern never point at missing anchors.
 */
export function MarketingNav() {
  const pathname = usePathname();
  const { theme, ready } = useTheme();
  const [domTheme, setDomTheme] = useState<AppTheme | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useLayoutEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (isAppTheme(attr)) setDomTheme(attr);
  }, [theme]);

  const effective: AppTheme = ready ? theme : (domTheme ?? "original");
  const modern = effective === "modern";
  const navLinks = modern ? MODERN_NAV_LINKS : ORIGINAL_NAV_LINKS;
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
          aria-label="Family Memory Vault"
        >
          {modern ? (
            <BrandLogo
              tone={overMedia ? "onDark" : "color"}
              size="lg"
              priority
              decorative
            />
          ) : (
            "Family Memory Vault"
          )}
        </Link>

        <nav className="marketing-nav-links" aria-label="Marketing">
          {navLinks.map((link) => {
            const active =
              link.href === "/pricing" && pathname.startsWith("/pricing");
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
          <Show when="signed-out">
            <Link href="/sign-in" className="marketing-nav-signin">
              Sign in
            </Link>
            <Link href="/sign-up" className="marketing-nav-cta">
              {modern ? "Begin your vault" : "Start preserving"}
            </Link>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className="marketing-nav-signin">
              {modern ? "Open vault" : "Go to vault"}
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
