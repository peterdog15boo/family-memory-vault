"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import {
  CreditCard,
  FileText,
  Film,
  Heart,
  Home,
  ImageIcon,
  Images,
  Package,
  Settings,
  Shield,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAskAiOptional } from "@/components/assistant/AskAiContext";
import {
  APP_THEME_DEFAULT,
  isAppTheme,
  type AppTheme,
} from "@/lib/theme/types";
import { cn } from "@/lib/utils";

type DashboardSidebarProps = {
  isAdmin?: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  match?: "exact" | "prefix";
  /** Opens floating Ask AI instead of navigating. */
  openAskAi?: boolean;
};

/**
 * App navigation. Modern: Home-first + grouped everyday vs keep-safe vs account.
 * Original: flat historical order preserved for revertability.
 */
export function DashboardSidebar({ isAdmin = false }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { theme, ready } = useTheme();
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

  const originalItems: NavItem[] = [
    { href: "/assistant", label: "Ask AI", icon: Sparkles, openAskAi: true },
    { href: "/memories", label: "Memories", icon: Images },
    { href: "/movies", label: "Movies", icon: Film },
    { href: "/media", label: "Photos", icon: ImageIcon },
    { href: "/upload", label: "Upload", icon: Upload },
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/people", label: "People", icon: Users },
    { href: "/family", label: "Family", icon: Home },
    { href: "/family-memory-box", label: "Digitize", icon: Package },
    { href: "/billing", label: "Billing", icon: CreditCard },
    { href: "/settings", label: "Settings", icon: Settings },
    ...(isAdmin
      ? [{ href: "/admin", label: "Admin", icon: Shield } as NavItem]
      : []),
  ];

  const modernGroups: { label?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: "/dashboard", label: "Home", icon: Home, match: "exact" },
        { href: "/memories", label: "Memories", icon: Images },
        { href: "/movies", label: "Movies", icon: Film },
        { href: "/media", label: "Photos", icon: ImageIcon },
        { href: "/upload", label: "Upload", icon: Upload },
        { href: "/people", label: "People", icon: Users },
        { href: "/assistant", label: "Ask AI", icon: Sparkles, openAskAi: true },
      ],
    },
    {
      label: "Keep safe",
      items: [
        {
          href: "/documents",
          label: "Documents",
          icon: FileText,
          match: "exact",
        },
        { href: "/documents/legacy", label: "Legacy", icon: Heart },
        { href: "/family", label: "Family", icon: Users },
      ],
    },
    {
      label: "Account",
      items: [
        { href: "/family-memory-box", label: "Digitize", icon: Package },
        { href: "/billing", label: "Plan", icon: CreditCard },
        { href: "/settings", label: "Settings", icon: Settings },
        ...(isAdmin
          ? [{ href: "/admin", label: "Admin", icon: Shield } as NavItem]
          : []),
      ],
    },
  ];

  function isActive(item: NavItem) {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    if (item.href === "/documents" && isModern) {
      return (
        pathname === "/documents" ||
        (pathname.startsWith("/documents/") &&
          !pathname.startsWith("/documents/legacy"))
      );
    }
    if (item.href === "/documents/legacy") {
      return pathname.startsWith("/documents/legacy");
    }
    if (item.href === "/family-memory-box") {
      return (
        pathname === "/family-memory-box" ||
        pathname.startsWith("/family-memory-box/") ||
        pathname.startsWith("/digitize")
      );
    }
    if (item.href === "/documents") {
      return (
        pathname === "/documents" || pathname.startsWith("/documents/")
      );
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  const groups = isModern ? modernGroups : [{ items: originalItems }];

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
            href="/dashboard"
            className="font-display text-lg tracking-tight text-ink transition-opacity hover:opacity-80"
          >
            Family Memory Vault
          </Link>
        </div>
      ) : null}

      <nav
        className={cn(
          "ui-nav flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0",
          isModern && "dashboard-sidebar-nav pt-1 lg:pt-0",
        )}
        aria-label="App"
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
          Kept private. Shared with care.
        </p>
      ) : (
        <div className="mt-auto hidden border-t border-ink/8 p-4 lg:block">
          <div className="dashboard-sidebar-note flex gap-2 rounded-md bg-canvas px-3 py-3 text-xs leading-relaxed text-ink-muted">
            <Shield
              className="mt-0.5 size-3.5 shrink-0 text-accent"
              aria-hidden
            />
            <p>
              A family-safe space. Photos and videos are looked over before they
              can be shared — for everyone’s peace of mind.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
