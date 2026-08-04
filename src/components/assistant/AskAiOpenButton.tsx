"use client";

import type { ReactNode } from "react";
import { useAskAiOptional } from "@/components/assistant/AskAiContext";
import { cn } from "@/lib/utils";

type AskAiOpenButtonProps = {
  className?: string;
  children: ReactNode;
  /** Prefill the composer when the panel opens. */
  prompt?: string;
  /** Start a fresh thread instead of resuming. */
  fresh?: boolean;
};

/** Opens the floating Ask AI panel (falls back to /assistant if provider missing). */
export function AskAiOpenButton({
  className,
  children,
  prompt,
  fresh,
}: AskAiOpenButtonProps) {
  const askAi = useAskAiOptional();

  if (!askAi) {
    const href = prompt
      ? `/assistant?prompt=${encodeURIComponent(prompt)}`
      : "/assistant";
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => askAi.openAskAi({ prompt, fresh })}
      className={cn(className)}
      aria-haspopup="dialog"
      aria-expanded={askAi.open}
    >
      {children}
    </button>
  );
}
