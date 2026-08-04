"use client";

import { Sparkles } from "lucide-react";
import { useAskAi } from "@/components/assistant/AskAiContext";
import { cn } from "@/lib/utils";

/**
 * Mobile floating entry for Ask AI (desktop uses the header action).
 * Restores a minimized session when one exists.
 */
export function AskAiFab({ className }: { className?: string }) {
  const { open, minimized, toggleAskAi, restoreAskAi } = useAskAi();

  if (open) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={restoreAskAi}
        className={cn(
          "ask-ai-fab ask-ai-fab--restore",
          className,
        )}
        aria-label="Restore Ask AI"
      >
        <Sparkles className="size-4" aria-hidden />
        Ask AI
        <span className="ask-ai-fab-badge">Open</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleAskAi}
      className={cn("ask-ai-fab", className)}
      aria-label="Ask AI"
    >
      <Sparkles className="size-4" aria-hidden />
      Ask AI
    </button>
  );
}
