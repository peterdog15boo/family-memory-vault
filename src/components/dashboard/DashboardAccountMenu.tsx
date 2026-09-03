"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SignOutButton } from "@clerk/nextjs";
import {
  Bot,
  CircleUser,
  LogOut,
  MessageCircleHeart,
  MessagesSquare,
  X,
} from "lucide-react";
import { useAskAi } from "@/components/assistant/AskAiContext";
import { useFamilyChat } from "@/components/family-chat/FamilyChatContext";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { isBetaFeedbackEnabled } from "@/lib/feedback/flags";
import { openFeedback } from "@/lib/feedback/open";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";

type DashboardAccountMenuProps = {
  displayName: string;
  email?: string | null;
};

/**
 * Compact account overflow for phone / short landscape chrome.
 * Holds Feedback, Family Chat, Ask AI, language, name, and Sign out.
 */
export function DashboardAccountMenu({
  displayName,
  email,
}: DashboardAccountMenuProps) {
  const t = useTranslations();
  const { openAskAi, closeAskAi } = useAskAi();
  const {
    openFamilyChat,
    closeFamilyChat,
    unreadCount,
    chatAvailable,
  } = useFamilyChat();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useOverlayA11y({
    open,
    onClose: () => setOpen(false),
    containerRef: panelRef,
    lockScroll: true,
    initialFocus: "container",
  });

  function close() {
    setOpen(false);
  }

  function runAndClose(action: () => void) {
    close();
    action();
  }

  const showFeedback = isBetaFeedbackEnabled();

  return (
    <>
      <button
        type="button"
        className="dashboard-icon-btn dashboard-account-menu-trigger inline-flex items-center justify-center rounded-md border border-ink/10 bg-canvas p-2 text-ink-muted transition-colors hover:border-ink/20 hover:text-ink"
        aria-label={t("nav.accountMenuAria")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CircleUser className="size-5" aria-hidden />
      </button>

      {mounted && open
        ? createPortal(
            <div
              data-app-portal=""
              className="dashboard-account-menu-overlay"
              onClick={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="dashboard-account-menu-panel ui-popover"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-4 py-3">
                  <div className="min-w-0">
                    <p
                      id={titleId}
                      className="truncate text-sm font-semibold text-ink"
                    >
                      {displayName}
                    </p>
                    {email ? (
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {email}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink"
                    onClick={close}
                    aria-label={t("common.close")}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>

                <div className="flex flex-col gap-0.5 p-2">
                  {showFeedback ? (
                    <button
                      type="button"
                      className="dashboard-account-menu-item"
                      onClick={() => runAndClose(() => openFeedback())}
                    >
                      <MessageCircleHeart className="size-4 shrink-0" aria-hidden />
                      <span>{t("feedback.linkLabel")}</span>
                    </button>
                  ) : null}

                  {chatAvailable ? (
                    <button
                      type="button"
                      className="dashboard-account-menu-item"
                      onClick={() =>
                        runAndClose(() => {
                          closeAskAi();
                          openFamilyChat();
                        })
                      }
                    >
                      <MessagesSquare className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 text-left">
                        {t("nav.familyChat")}
                      </span>
                      {unreadCount > 0 ? (
                        <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-accent px-1 text-[0.65rem] font-semibold leading-4 text-accent-foreground">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : null}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="dashboard-account-menu-item"
                    onClick={() =>
                      runAndClose(() => {
                        closeFamilyChat();
                        openAskAi();
                      })
                    }
                  >
                    <Bot className="size-4 shrink-0" aria-hidden />
                    <span>{t("nav.askAi")}</span>
                  </button>

                  <div className="border-t border-ink/8 px-2 py-2">
                    <LanguageSwitcher
                      className="dashboard-account-menu-lang w-full"
                      compact
                    />
                  </div>

                  <SignOutButton redirectUrl="/">
                    <button type="button" className="dashboard-account-menu-item">
                      <LogOut className="size-4 shrink-0" aria-hidden />
                      <span>{t("nav.signOut")}</span>
                    </button>
                  </SignOutButton>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
