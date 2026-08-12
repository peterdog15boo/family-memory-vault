"use client";

import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslations } from "@/components/i18n/LocaleProvider";

type DashboardUserMenuProps = {
  displayName: string;
  email?: string | null;
};

/**
 * Account chip in the app header — language + sign out, mobile-friendly.
 */
export function DashboardUserMenu({
  displayName,
  email,
}: DashboardUserMenuProps) {
  const t = useTranslations();

  return (
    <div className="dashboard-user-menu flex items-center gap-2 sm:gap-3">
      <div className="dashboard-user-menu-meta hidden min-w-0 text-right sm:block">
        <p className="truncate text-sm font-medium text-ink">{displayName}</p>
        {email ? (
          <p className="truncate text-xs text-ink-muted">{email}</p>
        ) : null}
      </div>
      <LanguageSwitcher compact className="dashboard-user-menu-lang" />
      <SignOutButton redirectUrl="/">
        <button
          type="button"
          className="dashboard-sign-out inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-2.5 py-2 text-sm text-ink-muted transition-colors hover:border-ink/20 hover:text-ink sm:px-3"
        >
          <LogOut className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{t("nav.signOut")}</span>
          <span className="sr-only sm:hidden">{t("nav.signOut")}</span>
        </button>
      </SignOutButton>
    </div>
  );
}
