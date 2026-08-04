"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { useAskAiOptional } from "@/components/assistant/AskAiContext";
import { AppPageIntro } from "@/components/ui/AppPageIntro";

type AssistantPageClientProps = {
  conversationId: string | null;
  /** Optional query prefill when landing on /assistant. */
  prompt?: string | null;
};

/**
 * Ask AI page — primary UX is the floating panel; deep links with ?c= keep
 * the full-page chat. Bare /assistant opens the floating panel and returns home.
 */
export function AssistantPageClient({
  conversationId,
  prompt = null,
}: AssistantPageClientProps) {
  const askAi = useAskAiOptional();
  const router = useRouter();

  useEffect(() => {
    if (!askAi) return;
    if (conversationId) {
      // Deep link: keep full-page resume for shareable threads.
      return;
    }
    askAi.openAskAi({
      prompt: prompt ?? undefined,
    });
    router.replace("/dashboard");
  }, [askAi, conversationId, prompt, router]);

  if (!conversationId) {
    return (
      <div className="app-page mx-auto max-w-lg py-16 text-center">
        <Sparkles className="mx-auto size-8 text-accent" aria-hidden />
        <p className="mt-3 font-display text-xl text-ink">Opening Ask AI…</p>
        <p className="mt-2 text-sm text-ink-muted">
          You can also use Ask AI from the header, sidebar, or floating button.
        </p>
      </div>
    );
  }

  return (
    <>
      <AppPageIntro
        slot="assistant"
        eyebrow={
          <>
            <Sparkles className="size-3.5" aria-hidden />
            Here to help
          </>
        }
        title="Ask AI"
        description="Tell me what you’re looking for in plain words. I’ll help find photos and turn them into a memory or movie."
      />

      <div className="app-page app-page--assistant mx-auto max-w-4xl">
        <div className="assistant-companion-panel">
          <AssistantChat initialConversationId={conversationId} />
        </div>
      </div>
    </>
  );
}
