"use client";

import { Bot } from "lucide-react";
import { useAskAi } from "@/components/assistant/AskAiContext";
import { useFamilyChat } from "@/components/family-chat/FamilyChatContext";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * Mobile floating entry for Ask AI (desktop uses the header action).
 * Restores a minimized session when one exists.
 */
export function AskAiFab({ className }: { className?: string }) {
  const { open, minimized, toggleAskAi, restoreAskAi } = useAskAi();
  const { closeFamilyChat } = useFamilyChat();
  const t = useTranslations();

  if (open) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => {
          closeFamilyChat();
          restoreAskAi();
        }}
        className={cn(
          "ask-ai-fab ask-ai-fab--restore",
          className,
        )}
        aria-label={t("assistant.restore")}
        aria-haspopup="dialog"
        aria-expanded={false}
      >
        <Bot className="size-4" aria-hidden />
        {t("nav.askAi")}
        <span className="ask-ai-fab-badge">{t("assistant.openBadge")}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        closeFamilyChat();
        toggleAskAi();
      }}
      className={cn("ask-ai-fab", className)}
      aria-label={t("nav.askAi")}
      aria-haspopup="dialog"
      aria-expanded={false}
    >
        <Bot className="size-4" aria-hidden />
        {t("nav.askAi")}
      </button>
  );
}
