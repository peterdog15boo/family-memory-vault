"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { CinematicBackdrop } from "@/components/cinematic/CinematicBackdrop";
import { APP_FOOTER_MEDIA } from "@/content/page-hero-media";

const FOOTER_LINKS = [
  { href: "/settings", label: "Settings" },
  { href: "/family", label: "Family" },
  { href: "/documents", label: "Documents" },
  { href: "/memories", label: "Memories" },
  { href: "/privacy", label: "Privacy" },
] as const;

/**
 * Modern app footer — restrained full-bleed cinematic close with brand,
 * warm tagline, and useful vault links. Original theme does not render this.
 */
export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer w-full" aria-label="Site">
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
              aria-label="Family Memory Vault"
            >
              <BrandLogo tone="color" size="lg" decorative />
            </Link>
            <p className="app-footer-tagline">
              Kept private. Shared with care.
            </p>
          </div>

          <nav className="app-footer-links" aria-label="Footer">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>

          <p className="app-footer-meta">
            © {year} Family Memory Vault
          </p>
        </div>
      </div>
    </footer>
  );
}
