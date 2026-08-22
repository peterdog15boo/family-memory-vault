"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CreditCard,
  FileText,
  Film,
  Heart,
  Home,
  ImageIcon,
  Images,
  Landmark,
  Package,
  Settings,
  Shield,
  Bot,
  Upload,
  Users,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAskAiOptional } from "@/components/assistant/AskAiContext";
import { APP_HOME_PATH } from "@/lib/routes";
import {
  APP_THEME_DEFAULT,
  isAppTheme,
  type AppTheme,
} from "@/lib/theme/types";
import { cn } from "@/lib/utils";

type DashboardSidebarProps = {
  isAdmin?: boolean;
  /** Documents / Digital Legacy / Connected Accounts — Legacy+ only. */
  showLegacyPlusNav?: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  match?: "exact" | "prefix";
  /** Opens floating Ask AI instead of navigating. */
  openAskAi?: boolean;
  /** Requires Legacy+ plan features. */
  legacyPlusOnly?: boolean;
};

const LEGACY_PLUS_HREFS = new Set(["/documents", "/legacy", "/accounts"]);

/**
 * App navigation. Modern: Home-first + grouped everyday vs keep-safe vs account.
 * Original: flat historical order preserved for revertability.
 */
export function DashboardSidebar({
  isAdmin = false,
  showLegacyPlusNav = false,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const { theme, ready } = useTheme();
  const t = useTranslations();
  const askAi = useAskAiOptional();
  const [domTheme, setDomTheme] = useState<AppTheme | null>(null);

  useLayoutEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    if (isAppTheme(attr)) setDomTheme(attr);
  }, [theme]);

  const effective: AppTheme = ready
    ? theme
    : (domTheme ?? APP_THEME_DEFAULT);
  const isModern = effective === "modern";

  const originalItems: NavItem[] = useMemo(
    () => [
      { href: "/assistant", label: t("nav.askAi"), icon: Bot, openAskAi: true },
      { href: "/memories", label: t("nav.memories"), icon: Images },
      { href: "/movies", label: t("nav.movies"), icon: Film },
      { href: "/media", label: t("nav.photos"), icon: ImageIcon },
      { href: "/on-this-day", label: t("nav.onThisDay"), icon: CalendarDays },
      { href: "/upload", label: t("nav.upload"), icon: Upload },
      {
        href: "/documents",
        label: t("nav.documents"),
        icon: FileText,
        legacyPlusOnly: true,
      },
      {
        href: "/legacy",
        label: t("nav.legacy"),
        icon: Heart,
        legacyPlusOnly: true,
      },
      {
        href: "/accounts",
        label: t("nav.accounts"),
        icon: Landmark,
        legacyPlusOnly: true,
      },
      { href: "/people", label: t("nav.people"), icon: Users },
      { href: "/family", label: t("nav.family"), icon: Home },
      { href: "/family-memory-box", label: t("nav.digitize"), icon: Package },
      { href: "/billing", label: t("nav.billing"), icon: CreditCard },
      { href: "/settings", label: t("nav.settings"), icon: Settings },
      ...(isAdmin
        ? [{ href: "/admin", label: t("nav.admin"), icon: Shield } as NavItem]
        : []),
    ],
    [isAdmin, t],
  );

  const modernGroups: { label?: string; items: NavItem[] }[] = useMemo(
    () => [
      {
        items: [
          {
            href: "/dashboard",
            label: t("nav.home"),
            icon: Home,
            match: "exact",
          },
          { href: "/memories", label: t("nav.memories"), icon: Images },
          { href: "/movies", label: t("nav.movies"), icon: Film },
          { href: "/media", label: t("nav.photos"), icon: ImageIcon },
          {
            href: "/on-this-day",
            label: t("nav.onThisDay"),
            icon: CalendarDays,
          },
          { href: "/upload", label: t("nav.upload"), icon: Upload },
          { href: "/people", label: t("nav.people"), icon: Users },
          {
            href: "/assistant",
            label: t("nav.askAi"),
            icon: Bot,
            openAskAi: true,
          },
        ],
      },
      {
        label: t("nav.keepSafe"),
        items: [
          {
            href: "/documents",
            label: t("nav.documents"),
            icon: FileText,
            match: "exact",
            legacyPlusOnly: true,
          },
          {
            href: "/legacy",
            label: t("nav.legacy"),
            icon: Heart,
            legacyPlusOnly: true,
          },
          {
            href: "/accounts",
            label: t("nav.accounts"),
            icon: Landmark,
            legacyPlusOnly: true,
          },
          { href: "/family", label: t("nav.family"), icon: Users },
        ],
      },
      {
        label: t("nav.account"),
        items: [
          {
            href: "/family-memory-box",
            label: t("nav.digitize"),
            icon: Package,
          },
          { href: "/billing", label: t("nav.plan"), icon: CreditCard },
          { href: "/settings", label: t("nav.settings"), icon: Settings },
          ...(isAdmin
            ? [
                {
                  href: "/admin",
                  label: t("nav.admin"),
                  icon: Shield,
                } as NavItem,
              ]
            : []),
        ],
      },
    ],
    [isAdmin, t],
  );

  function isVisible(item: NavItem) {
    if (item.legacyPlusOnly || LEGACY_PLUS_HREFS.has(item.href)) {
      return showLegacyPlusNav;
    }
    return true;
  }

  function isActive(item: NavItem) {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    if (item.href === "/legacy") {
      return (
        pathname === "/legacy" ||
        pathname.startsWith("/legacy/") ||
        pathname.startsWith("/documents/legacy")
      );
    }
    if (item.href === "/documents") {
      return (
        pathname === "/documents" ||
        (pathname.startsWith("/documents/") &&
          !pathname.startsWith("/documents/legacy"))
      );
    }
    if (item.href === "/family-memory-box") {
      return (
        pathname === "/family-memory-box" ||
        pathname.startsWith("/family-memory-box/") ||
        pathname.startsWith("/digitize")
      );
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  const groups = (isModern ? modernGroups : [{ items: originalItems }])
    .map((group) => ({
      ...group,
      items: group.items.filter(isVisible),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        "dashboard-sidebar flex w-full shrink-0 flex-col",
        isModern
          ? "dashboard-sidebar--modern"
          : "border-b border-ink/8 bg-canvas-deep/70 lg:w-60 lg:border-b-0 lg:border-r",
      )}
    >
      {!isModern ? (
        <div className="dashboard-sidebar-brand flex items-center gap-2 px-5 py-5">
          <Link
            href={APP_HOME_PATH}
            className="font-display text-lg tracking-tight text-ink transition-opacity hover:opacity-80"
          >
            {t("meta.appName")}
          </Link>
        </div>
      ) : null}

      <nav
        className={cn(
          "ui-nav flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0",
          isModern && "dashboard-sidebar-nav pt-1 lg:pt-0",
        )}
        aria-label={t("nav.app")}
      >
        {groups.map((group, gi) => (
          <div key={group.label ?? `g-${gi}`} className="dashboard-nav-group">
            {group.label ? (
              <p className="dashboard-nav-group-label">{group.label}</p>
            ) : null}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.openAskAi
                ? Boolean(askAi?.open)
                : isActive(item);
              if (item.openAskAi && askAi) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => askAi.openAskAi()}
                    className={cn(
                      "ui-nav-link",
                      active && "ui-nav-link-active",
                    )}
                    aria-expanded={askAi.open}
                    aria-haspopup="dialog"
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </button>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "ui-nav-link",
                    active && "ui-nav-link-active",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {isModern ? (
        <p className="dashboard-sidebar-whisper mt-auto hidden lg:block">
          {t("nav.sidebarWhisper")}
        </p>
      ) : (
        <div className="mt-auto hidden border-t border-ink/8 p-4 lg:block">
          <div className="dashboard-sidebar-note flex gap-2 rounded-md bg-canvas px-3 py-3 text-xs leading-relaxed text-ink-muted">
            <Shield
              className="mt-0.5 size-3.5 shrink-0 text-accent"
              aria-hidden
            />
            <p>{t("nav.sidebarSafety")}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
