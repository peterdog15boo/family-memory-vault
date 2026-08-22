"use client";

import { MessagesSquare } from "lucide-react";
import { useAskAi } from "@/components/assistant/AskAiContext";
import { useFamilyChat } from "@/components/family-chat/FamilyChatContext";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export function FamilyChatHeaderButton() {
  const t = useTranslations();
  const { closeAskAi } = useAskAi();
  const { open, openFamilyChat, closeFamilyChat, unreadCount, chatAvailable } =
    useFamilyChat();

  if (!chatAvailable) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (open) {
          closeFamilyChat();
        } else {
          closeAskAi();
          openFamilyChat();
        }
      }}
      className={cn(
        "dashboard-icon-btn relative inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-2.5 py-2 text-ink-muted transition-colors hover:border-ink/20 hover:text-ink sm:px-3",
        open && "border-accent/30 text-accent-deep",
      )}
      aria-label={
        unreadCount > 0
          ? t("familyChat.openWithUnread", { count: unreadCount })
          : t("nav.familyChat")
      }
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      <MessagesSquare className="size-4" aria-hidden />
      <span className="hidden text-xs font-medium sm:inline">
        {t("nav.familyChat")}
      </span>
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-accent px-1 text-[0.65rem] font-semibold leading-4 text-accent-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
