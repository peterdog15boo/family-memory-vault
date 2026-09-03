"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Shield, Bot } from "lucide-react";
import { AskAiFab } from "@/components/assistant/AskAiFab";
import { AskAiPanel } from "@/components/assistant/AskAiPanel";
import { AskAiProvider, useAskAi } from "@/components/assistant/AskAiContext";
import { AvaHelper } from "@/components/ava/AvaHelper";
import { FamilyChatFab } from "@/components/family-chat/FamilyChatFab";
import { FamilyChatHeaderButton } from "@/components/family-chat/FamilyChatHeaderButton";
import {
  FamilyChatProvider,
  useFamilyChat,
} from "@/components/family-chat/FamilyChatContext";
import { FamilyChatPanel } from "@/components/family-chat/FamilyChatPanel";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AppFooter } from "@/components/dashboard/AppFooter";
import { DashboardAccountMenu } from "@/components/dashboard/DashboardAccountMenu";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardUserMenu } from "@/components/dashboard/DashboardUserMenu";
import { useShellSectionTitle } from "@/components/dashboard/useShellSectionTitle";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { CelebrationHost } from "@/components/celebrations/CelebrationHost";
import { PasskeyEnrollPrompt } from "@/components/auth/PasskeyEnrollPrompt";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PushSubscriptionSync } from "@/components/notifications/PushSubscriptionSync";
import { IdleSessionGuard } from "@/components/session/IdleSessionGuard";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  SHELL_COMPACT_CHROME_MQ,
  useMediaQuery,
} from "@/hooks/useMediaQuery";
import type { AvaProgress } from "@/lib/ava/types";
import { APP_HOME_PATH } from "@/lib/routes";
import type { IdleTimeoutPolicy } from "@/lib/session/idle-timeout-policy";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  displayName: string;
  email?: string | null;
  isAdmin?: boolean;
  initialUnreadCount?: number;
  initialAvaProgress?: AvaProgress | null;
  idleTimeoutPolicy?: IdleTimeoutPolicy;
  /** Legacy+ plan: show Documents / Digital Legacy / Connected Accounts nav. */
  showLegacyPlusNav?: boolean;
  /** Family / Family Plus / Legacy+: show Family Tree nav. */
  showFamilyTreeNav?: boolean;
  children: ReactNode;
};

/**
 * Authenticated app chrome.
 * Slim full-bleed header → sidebar + main (page heroes live in main) → full-bleed footer.
 * Phone / short landscape: logo | section | Ava | bell | account menu.
 * Desktop wide: full header actions unchanged.
 */
export function DashboardShell(props: DashboardShellProps) {
  return (
    <AskAiProvider>
      <FamilyChatProvider>
        <DashboardShellInner {...props} />
      </FamilyChatProvider>
    </AskAiProvider>
  );
}

function DashboardShellInner({
  displayName,
  email,
  isAdmin = false,
  initialUnreadCount = 0,
  initialAvaProgress = null,
  idleTimeoutPolicy,
  showLegacyPlusNav = false,
  showFamilyTreeNav = false,
  children,
}: DashboardShellProps) {
  const { isModern } = useTheme();
  const t = useTranslations();
  const { open, openAskAi } = useAskAi();
  const { closeFamilyChat } = useFamilyChat();
  const compactChrome = useMediaQuery(SHELL_COMPACT_CHROME_MQ);
  const sectionTitle = useShellSectionTitle();

  return (
    <div
      className={cn(
        "dashboard-shell flex min-h-full flex-col bg-canvas",
        isModern && "dashboard-shell--modern bg-transparent",
        compactChrome && "dashboard-shell--compact-chrome",
      )}
      data-shell-chrome={compactChrome ? "compact" : "expanded"}
    >
      <header
        className={cn(
          "dashboard-shell-header relative z-40 flex w-full shrink-0 items-center justify-between gap-3 border-b border-ink/8 bg-canvas/90 px-4 py-3 backdrop-blur-sm sm:gap-4 sm:px-5 sm:py-4",
          isModern && "dashboard-shell-header--modern",
          compactChrome && "dashboard-shell-header--compact",
        )}
      >
        {isModern ? (
          <div className="dashboard-shell-brand-cluster min-w-0">
            <Link
              href={APP_HOME_PATH}
              className="inline-flex shrink-0 transition-opacity hover:opacity-80"
              aria-label={t("meta.appName")}
            >
              <BrandLogo
                tone="onDark"
                size={compactChrome ? "md" : "lg"}
                priority
                decorative
              />
            </Link>
            <p className="dashboard-shell-greeting truncate text-sm text-ink-muted lg:text-[0.95rem]">
              {t("nav.welcomeBack")}
            </p>
          </div>
        ) : (
          <div className="dashboard-shell-safety flex min-w-0 items-start gap-2 lg:hidden">
            <Shield
              className="mt-0.5 size-4 shrink-0 text-accent"
              aria-hidden
            />
            <p className="page-lead text-xs leading-relaxed text-ink-muted">
              {t("nav.familySafeNote")}
            </p>
          </div>
        )}

        {sectionTitle ? (
          <p className="dashboard-shell-section-title min-w-0 flex-1 truncate text-center text-sm font-semibold text-ink">
            {sectionTitle}
          </p>
        ) : (
          <span
            className="dashboard-shell-section-spacer min-w-0 flex-1"
            aria-hidden
          />
        )}

        <div className="dashboard-shell-toolbar ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
          <div className="dashboard-shell-toolbar-actions-expanded flex items-center gap-2 sm:gap-3">
            <FeedbackButton placement="header" />
            <FamilyChatHeaderButton />
            <button
              type="button"
              onClick={() => {
                closeFamilyChat();
                openAskAi();
              }}
              className={cn(
                "dashboard-icon-btn relative inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-2.5 py-2 text-ink-muted transition-colors hover:border-ink/20 hover:text-ink sm:px-3",
                open && "border-accent/30 text-accent-deep",
              )}
              aria-label={t("nav.askAi")}
              aria-expanded={open}
              aria-haspopup="dialog"
            >
              <Bot className="size-4" aria-hidden />
              <span className="hidden text-xs font-medium sm:inline">
                {t("nav.askAi")}
              </span>
            </button>
          </div>

          <span
            id="ava-header-slot"
            className="dashboard-shell-ava-slot inline-flex items-center"
          />

          <NotificationBell initialUnreadCount={initialUnreadCount} />

          <div className="dashboard-shell-toolbar-account-expanded">
            <DashboardUserMenu displayName={displayName} email={email} />
          </div>
          <div className="dashboard-shell-toolbar-account-compact">
            <DashboardAccountMenu displayName={displayName} email={email} />
          </div>
        </div>
      </header>

      <div className="dashboard-shell-body flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <DashboardSidebar
          isAdmin={isAdmin}
          showLegacyPlusNav={showLegacyPlusNav}
          showFamilyTreeNav={showFamilyTreeNav}
        />
        <div className="dashboard-shell-main app-shell-stage flex min-w-0 flex-1 flex-col px-5 py-8 sm:px-8 sm:pb-12">
          {children}
        </div>
      </div>

      {isModern ? <AppFooter showLegacyPlusNav={showLegacyPlusNav} /> : null}

      <AvaHelper initialProgress={initialAvaProgress} />
      <CelebrationHost />
      <PasskeyEnrollPrompt />
      <PushSubscriptionSync />
      <IdleSessionGuard initialPolicy={idleTimeoutPolicy} />
      <AskAiFab />
      <FamilyChatFab />
      <AskAiPanel
        greetingName={
          initialAvaProgress?.screenName?.trim() || displayName || null
        }
      />
      <FamilyChatPanel />
    </div>
  );
}
