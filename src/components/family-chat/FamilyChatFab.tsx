"use client";

import { MessagesSquare } from "lucide-react";
import { useAskAi } from "@/components/assistant/AskAiContext";
import { useFamilyChat } from "@/components/family-chat/FamilyChatContext";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * Optional mobile FAB on the left so it does not collide with Ask AI (right).
 * Does not auto-open; only appears when chat is available and closed.
 */
export function FamilyChatFab({ className }: { className?: string }) {
  const { open, openFamilyChat, chatAvailable, unreadCount } = useFamilyChat();
  const { closeAskAi } = useAskAi();
  const t = useTranslations();

  if (!chatAvailable || open) return null;

  return (
    <button
      type="button"
      onClick={() => {
        closeAskAi();
        openFamilyChat();
      }}
      className={cn("family-chat-fab", className)}
      aria-label={
        unreadCount > 0
          ? t("familyChat.openWithUnread", { count: unreadCount })
          : t("nav.familyChat")
      }
      aria-haspopup="dialog"
      aria-expanded={false}
    >
      <MessagesSquare className="size-4" aria-hidden />
      <span className="family-chat-fab-label">{t("nav.familyChat")}</span>
      {unreadCount > 0 ? (
        <span className="family-chat-fab-badge">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
