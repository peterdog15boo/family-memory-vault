"use client";

import type { ReactNode } from "react";
import { Shield, Sparkles } from "lucide-react";
import { AskAiFab } from "@/components/assistant/AskAiFab";
import { AskAiPanel } from "@/components/assistant/AskAiPanel";
import { AskAiProvider, useAskAi } from "@/components/assistant/AskAiContext";
import { AvaHelper } from "@/components/ava/AvaHelper";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppFooter } from "@/components/dashboard/AppFooter";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardUserMenu } from "@/components/dashboard/DashboardUserMenu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { AvaProgress } from "@/lib/ava/types";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  displayName: string;
  email?: string | null;
  isAdmin?: boolean;
  initialUnreadCount?: number;
  initialAvaProgress?: AvaProgress | null;
  children: ReactNode;
};

/**
 * Authenticated app chrome.
 * Slim full-bleed header → sidebar + main (page heroes live in main) → full-bleed footer.
 */
export function DashboardShell(props: DashboardShellProps) {
  return (
    <AskAiProvider>
      <DashboardShellInner {...props} />
    </AskAiProvider>
  );
}

function DashboardShellInner({
  displayName,
  email,
  isAdmin = false,
  initialUnreadCount = 0,
  initialAvaProgress = null,
  children,
}: DashboardShellProps) {
  const { isModern } = useTheme();
  const { open, openAskAi } = useAskAi();

  return (
    <div
      className={cn(
        "dashboard-shell flex min-h-full flex-col bg-canvas",
        isModern && "dashboard-shell--modern",
      )}
    >
      <header
        className={cn(
          "dashboard-shell-header relative z-40 flex w-full shrink-0 items-center justify-between gap-4 border-b border-ink/8 bg-canvas/90 px-5 py-4 backdrop-blur-sm",
          isModern && "dashboard-shell-header--modern",
        )}
      >
        {isModern ? (
          <div className="dashboard-shell-brand-cluster min-w-0">
            <BrandLogo tone="color" size="lg" priority decorative />
            <p className="dashboard-shell-greeting truncate text-sm text-ink-muted lg:text-[0.95rem]">
              Welcome back
            </p>
          </div>
        ) : (
          <div className="dashboard-shell-safety flex items-start gap-2 lg:hidden">
            <Shield
              className="mt-0.5 size-4 shrink-0 text-accent"
              aria-hidden
            />
            <p className="page-lead text-xs leading-relaxed text-ink-muted">
              Family-safe — photos are looked over before sharing.
            </p>
          </div>
        )}
        <div className="dashboard-shell-toolbar ml-auto flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => openAskAi()}
            className={cn(
              "dashboard-icon-btn relative inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-2.5 py-2 text-ink-muted transition-colors hover:border-ink/20 hover:text-ink sm:px-3",
              open && "border-accent/30 text-accent-deep",
            )}
            aria-label="Ask AI"
            aria-expanded={open}
            aria-haspopup="dialog"
          >
            <Sparkles className="size-4" aria-hidden />
            <span className="hidden text-xs font-medium sm:inline">Ask AI</span>
          </button>
          <span id="ava-header-slot" className="inline-flex items-center" />
          <NotificationBell initialUnreadCount={initialUnreadCount} />
          <DashboardUserMenu displayName={displayName} email={email} />
        </div>
      </header>

      <div className="dashboard-shell-body flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <DashboardSidebar isAdmin={isAdmin} />
        <div className="dashboard-shell-main app-shell-stage flex min-w-0 flex-1 flex-col px-5 py-8 sm:px-8 sm:pb-12">
          {children}
        </div>
      </div>

      {isModern ? <AppFooter /> : null}

      <AvaHelper initialProgress={initialAvaProgress} />
      <AskAiFab />
      <AskAiPanel />
    </div>
  );
}
