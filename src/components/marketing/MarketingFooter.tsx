"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useTheme } from "@/components/theme/ThemeProvider";
import { isAppTheme, type AppTheme } from "@/lib/theme/types";

/**
 * Quiet marketing footer — theme-aware links so Modern never points
 * at Original-only anchors (and vice versa).
 */
export function MarketingFooter() {
  const year = new Date().getFullYear();
  const { theme, ready } = useTheme();
  const [domTheme, setDomTheme] = useState<AppTheme | null>(null);

  useLayoutEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (isAppTheme(attr)) setDomTheme(attr);
  }, [theme]);

  const effective: AppTheme = ready ? theme : (domTheme ?? "original");
  const modern = effective === "modern";

  const links = modern
    ? [
        { href: "/#promise", label: "Preserve" },
        { href: "/privacy", label: "Privacy" },
        { href: "/pricing", label: "Pricing" },
      ]
    : [
        { href: "/privacy", label: "Privacy" },
        { href: "/#how-it-works", label: "How it works" },
        { href: "/pricing", label: "Pricing" },
      ];

  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-inner">
        <div className="marketing-footer-brand">
          {modern ? (
            <BrandLogo tone="color" size="md" />
          ) : (
            <p className="marketing-footer-name">Family Memory Vault</p>
          )}
          <p className="marketing-footer-tagline">
            Kept private. Shared with care.
          </p>
        </div>

        <nav className="marketing-footer-links" aria-label="Footer">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="marketing-footer-copy">© {year}</p>
      </div>
    </footer>
  );
}
