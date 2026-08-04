"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { useTheme } from "@/components/theme/ThemeProvider";
import { THEME_EVALUATION_PAGES } from "@/lib/theme/types";

/**
 * Settings section for choosing Modern (default) vs Original appearance.
 */
export function ThemeSettingsSection() {
  const { theme, useModernDefault, ready, isModern } = useTheme();

  return (
    <section id="appearance" className="ui-card ui-card-elevated ui-card-pad-lg">
      {isModern ? (
        <div className="settings-brand-moment">
          <BrandLogo tone="color" size="md" />
          <p className="settings-brand-moment-copy">
            Modern look for Family Memory Vault — calm, photographic, and
            private by design.
          </p>
        </div>
      ) : null}

      <h2 className="font-display text-xl tracking-tight text-ink">
        Appearance
      </h2>
      <p className="page-lead mt-2 text-sm leading-relaxed text-ink-muted">
        Modern is the default look for Family Memory Vault. You can switch to
        Original anytime — the change only affects visuals on this device, never
        your memories or data.
      </p>

      {isModern ? (
        <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
          Modern (default) is active
        </p>
      ) : (
        <p className="mt-3 text-sm font-medium text-[color:var(--ink)]">
          Original is active on this device
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
            onClick={() => useModernDefault()}
            className="ui-btn ui-btn-primary"
          >
            Use Modern (default)
          </button>
        </div>
      ) : null}

      <div className="mt-6 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/40 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
          Compare looks on
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-sm text-[color:var(--ink-muted)]">
          {THEME_EVALUATION_PAGES.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
              >
                {page.label}
              </Link>
            </li>
          ))}
          <li className="w-full text-xs text-[color:var(--ink-muted)]">
            Active theme:{" "}
            <span className="font-medium text-[color:var(--ink)]">{theme}</span>.
            Deep-link with{" "}
            <code className="rounded bg-black/5 px-1">?theme=modern</code> or{" "}
            <code className="rounded bg-black/5 px-1">?theme=original</code>.
          </li>
        </ul>
      </div>
    </section>
  );
}
