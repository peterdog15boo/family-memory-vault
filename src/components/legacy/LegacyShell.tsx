"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Heart, Lock } from "lucide-react";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { useCopy, useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type LegacyShellProps = {
  children: React.ReactNode;
};

export function LegacyShell({ children }: LegacyShellProps) {
  const pathname = usePathname();
  const copy = useCopy();
  const t = useTranslations();
  const legacyNav = [
    { href: "/documents/legacy", label: t("legacy.navOverview") },
    { href: "/documents/legacy/message", label: t("legacy.navMessage") },
    { href: "/documents/legacy/contacts", label: t("legacy.navContacts") },
    { href: "/documents/legacy/business", label: t("legacy.navBusiness") },
    { href: "/documents/legacy/practical", label: t("legacy.navPractical") },
    { href: "/documents/legacy/accounts", label: t("legacy.navFinancialAccounts") },
    { href: "/documents/legacy/secure", label: t("legacy.navSecure") },
    { href: "/documents/legacy/emergency", label: t("legacy.navEmergency") },
  ] as const;

  return (
    <>
      <AppPageIntro
        slot="legacy"
        eyebrow={
          <>
            <Lock className="size-3.5" aria-hidden />
            Private · {copy.legacy.subtitle}
          </>
        }
        title={
          <>
            {copy.legacy.title}{" "}
            <HintTooltip
              tip={copy.tips.digitalLegacy}
              label={t("pages.legacyAbout")}
            />
          </>
        }
        description={copy.legacy.overviewLead}
        modernExtra={
          <Link
            href="/documents"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t("pages.legacyBack")}
          </Link>
        }
        originalExtra={
          <Link
            href="/documents"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t("pages.legacyBack")}
          </Link>
        }
      />

      <div className="legacy-vault documents-vault app-page mx-auto max-w-6xl">
        <div className="mt-8 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="legacy-vault-panel documents-vault-panel legacy-vault-in space-y-3 rounded-2xl p-3 lg:sticky lg:top-6 lg:self-start">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--legacy-muted)]">
              {t("pages.legacySections")}
            </p>
            <nav
              className="flex flex-col gap-0.5"
              aria-label={t("pages.legacyNavAria")}
            >
              {legacyNav.map((item) => {
                const active =
                  item.href === "/documents/legacy"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center rounded-lg px-3 py-2.5 text-left text-sm transition",
                      active
                        ? "bg-[color:var(--legacy-accent-soft)] font-medium text-[color:var(--legacy-accent-deep)]"
                        : "text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)] hover:text-[color:var(--legacy-ink)]",
                    )}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </nav>
            <div className="mx-2 mt-2 hidden rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-surface)]/60 px-3 py-3 lg:block">
              <p className="flex items-start gap-2 text-xs leading-relaxed text-[color:var(--legacy-muted)]">
                <Heart
                  className="mt-0.5 size-3.5 shrink-0 text-[color:var(--legacy-accent)]"
                  aria-hidden
                />
                {copy.legacy.overviewPrivacy}
              </p>
            </div>
          </aside>

          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </>
  );
}
