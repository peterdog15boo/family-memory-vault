"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { useTheme } from "@/components/theme/ThemeProvider";
import { THEME_EVALUATION_PAGES } from "@/lib/theme/types";

/**
 * Settings section for choosing Modern (default) vs Original appearance.
 */
const EVALUATION_PAGE_KEYS: Record<string, string> = {
  "/": "pages.landing",
  "/sign-in": "nav.signIn",
  "/pricing": "nav.pricing",
  "/dashboard": "pages.dashboard",
  "/media": "nav.photos",
  "/memories": "nav.memories",
  "/people": "nav.people",
  "/movies": "nav.movies",
  "/assistant": "nav.askAi",
  "/documents": "nav.documents",
  "/legacy": "pages.legacyPlanTitle",
  "/documents/legacy": "legacy.title",
};

export function ThemeSettingsSection() {
  const { theme, applyModernDefault, ready, isModern } = useTheme();
  const t = useTranslations();

  return (
    <section id="appearance" className="ui-card ui-card-elevated ui-card-pad-lg">
      {isModern ? (
        <div className="settings-brand-moment">
          <BrandLogo tone="color" size="md" />
          <p className="settings-brand-moment-copy">
            {t("settings.brandMoment")}
          </p>
        </div>
      ) : null}

      <h2 className="font-display text-xl tracking-tight text-ink">
        {t("settings.appearanceTitle")}
      </h2>
      <p className="page-lead mt-2 text-sm leading-relaxed text-ink-muted">
        {t("settings.appearanceLead")}
      </p>

      {isModern ? (
        <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
          {t("settings.appearanceModernActive")}
        </p>
      ) : (
        <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
          {t("settings.appearanceOriginalActive")}
        </p>
      )}

      <div className="mt-5">
        <ThemeSwitcher />
      </div>

      {!isModern ? (
        <div className="mt-5">
          <button
            type="button"
            disabled={!ready}
            onClick={() => applyModernDefault()}
            className="ui-btn ui-btn-primary"
          >
            {t("settings.useModern")}
          </button>
        </div>
      ) : null}

      <div className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/40 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
          {t("settings.compareLooks")}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-sm text-[color:var(--ink-muted)]">
          {THEME_EVALUATION_PAGES.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
              >
                {t(EVALUATION_PAGE_KEYS[page.href] ?? page.label)}
              </Link>
            </li>
          ))}
          <li className="w-full text-xs text-[color:var(--ink-muted)]">
            {t("settings.activeTheme", { theme })}{" "}
            <code className="rounded bg-black/5 px-1">?theme=modern</code> /{" "}
            <code className="rounded bg-black/5 px-1">?theme=original</code>.
          </li>
        </ul>
      </div>
    </section>
  );
}
