"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Ava } from "@/components/ava/Ava";
import { AssistantTurnCard } from "@/components/assistant/AssistantTurnCard";
import { useAskAiOptional } from "@/components/assistant/AskAiContext";
import {
  ASSISTANT_EXAMPLE_PROMPTS,
  type AssistantChatMessage,
  type AssistantTurnView,
} from "@/components/assistant/types";
import { cn } from "@/lib/utils";

type AssistantChatProps = {
  /** Resume an existing conversation when provided. */
  initialConversationId?: string | null;
  /** page = full /assistant experience; panel = floating drawer. */
  variant?: "page" | "panel";
  onClose?: () => void;
  /** Called when the user follows an in-app navigation link from a turn. */
  onNavigateAway?: () => void;
  /** Persist conversation id to parent (Ask AI panel context). */
  onConversationIdChange?: (id: string | null) => void;
  /** If no conversation id, load the user's most recent thread. */
  resumeLatestIfEmpty?: boolean;
  /** Bump to focus the composer (panel open). */
  focusNonce?: number;
};

type ApiConversation = {
  id: string;
  title: string | null;
};

type ApiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  metadata?: {
    intent?: Record<string, unknown> | null;
    mediaIds?: string[];
    pendingProposal?: {
      id: string;
      status: string;
      stage: string;
      totalCount: number;
      titleSuggestion?: string | null;
      themePreference?: string | null;
      mediaIds: string[];
      sampleThumbnails: Array<{ mediaId: string; previewUrl: string | null }>;
      clarifyingQuestions: string[];
    } | null;
    searchPreview?: {
      totalCount: number;
      mediaIds: string[];
      sampleThumbnails: Array<{ mediaId: string; previewUrl: string | null }>;
      people: Array<{ id: string; name: string }>;
      dateLabel?: string;
    } | null;
  };
};

/**
 * Assistant chat — full page or floating panel. Same APIs and safety rules.
 */
export function AssistantChat({
  initialConversationId = null,
  variant = "page",
  onClose,
  onNavigateAway,
  onConversationIdChange,
  resumeLatestIfEmpty = false,
  focusNonce = 0,
}: AssistantChatProps) {
  const isPanel = variant === "panel";
  const askAi = useAskAiOptional();
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId,
  );
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(
    Boolean(initialConversationId) || (isPanel && resumeLatestIfEmpty),
  );
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  const resumeAttemptedRef = useRef(false);

  function updateConversationId(id: string | null) {
    setConversationId(id);
    onConversationIdChange?.(id);
  }

  // Sync when parent clears/changes the conversation (fresh chat / deep link).
  useEffect(() => {
    if (initialConversationId === conversationId) return;
    if (initialConversationId == null) {
      // Parent cleared — fresh chat — or still null while we resume locally.
      if (loadedIdRef.current != null || messages.length > 0) {
        loadedIdRef.current = null;
        resumeAttemptedRef.current = true;
        setConversationId(null);
        setMessages([]);
        setError(null);
        setBooting(false);
        return;
      }
      // Empty + parent null: do not wipe a local id mid-resume; unlock if already attempted.
      if (resumeAttemptedRef.current && !conversationId) {
        setBooting(false);
      }
      return;
    }
    // New id from parent — load it below via loadedIdRef miss.
    setConversationId(initialConversationId);
    setBooting(true);
  }, [initialConversationId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional sync on parent id

  // Load a specific conversation when id is set and not yet loaded.
  useEffect(() => {
    if (!conversationId) return;
    if (loadedIdRef.current === conversationId) return;
    let cancelled = false;

    (async () => {
      setBooting(true);
      try {
        const res = await fetch(
          `/api/assistant/conversations/${conversationId}`,
        );
        if (!res.ok) throw new Error("Could not load conversation");
        const data = (await res.json()) as {
          conversation: ApiConversation;
          messages: ApiMessage[];
        };
        if (cancelled) return;
        loadedIdRef.current = data.conversation.id;
        updateConversationId(data.conversation.id);
        setMessages(
          data.messages.filter((m) => m.role !== "system").map(apiMessageToChat),
        );
      } catch (err) {
        if (!cancelled) {
          loadedIdRef.current = null;
          updateConversationId(null);
          setError(
            err instanceof Error ? err.message : "Failed to load conversation",
          );
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Panel: resume latest server conversation when nothing is selected yet.
  useEffect(() => {
    if (!isPanel || !resumeLatestIfEmpty) return;
    if (conversationId) return;
    if (resumeAttemptedRef.current) {
      // Fresh chat (or prior attempt) — keep composer usable.
      setBooting(false);
      return;
    }

    let cancelled = false;
    resumeAttemptedRef.current = true;

    (async () => {
      setBooting(true);
      try {
        const res = await fetch("/api/assistant/conversations?limit=1");
        if (!res.ok) throw new Error("Could not list conversations");
        const data = (await res.json()) as {
          conversations: ApiConversation[];
        };
        if (cancelled) return;
        const latest = data.conversations[0];
        if (latest?.id) {
          updateConversationId(latest.id);
          // load effect will fetch messages + clear booting
        } else {
          setBooting(false);
        }
      } catch {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
      // Strict Mode remount must be allowed to retry resume.
      if (!conversationId) {
        resumeAttemptedRef.current = false;
      }
    };
  }, [isPanel, resumeLatestIfEmpty, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prefill + focus when the panel opens.
  useEffect(() => {
    if (!isPanel || !askAi) return;
    if (!focusNonce) return;
    const pending = askAi.consumePendingPrompt();
    if (pending) setDraft(pending);
    // After paint so the textarea is enabled / visible.
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      if (pending) {
        const el = inputRef.current;
        if (el) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      }
    }, 40);
    return () => window.clearTimeout(id);
  }, [focusNonce, isPanel, askAi]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: isPanel ? "nearest" : "end",
    });
  }, [messages, busy, isPanel]);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const res = await fetch("/api/assistant/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      throw new Error("Could not start a conversation");
    }
    const data = (await res.json()) as { conversation: ApiConversation };
    loadedIdRef.current = data.conversation.id;
    updateConversationId(data.conversation.id);
    return data.conversation.id;
  }

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    setError(null);
    setBusy(true);
    setDraft("");

    const optimisticId = `local-user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const id = await ensureConversation();
      const res = await fetch(`/api/assistant/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Assistant request failed");
      }

      const data = (await res.json()) as { turn: AssistantTurnView };
      const turn = data.turn;

      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
        return [
          ...withoutOptimistic,
          {
            id: turn.userMessageId || optimisticId,
            role: "user",
            content,
            createdAt: new Date().toISOString(),
          },
          {
            id: turn.assistantMessageId || `assistant-${Date.now()}`,
            role: "assistant",
            content: turn.assistantText,
            createdAt: new Date().toISOString(),
            turn,
          },
        ];
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setDraft(content);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function confirmOrCancel(
    proposalId: string,
    cancel: boolean,
    selectedMediaIds?: string[],
  ) {
    if (!conversationId || busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          proposalId,
          cancel,
          ...(cancel || !selectedMediaIds?.length
            ? {}
            : { mediaIds: selectedMediaIds }),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not update proposal");
      }

      const data = (await res.json()) as { turn: AssistantTurnView };
      const turn = data.turn;

      setMessages((prev) => [
        ...prev,
        {
          id: turn.userMessageId || `user-confirm-${Date.now()}`,
          role: "user",
          content: cancel ? "Cancel" : "Yes",
          createdAt: new Date().toISOString(),
        },
        {
          id: turn.assistantMessageId || `assistant-confirm-${Date.now()}`,
          role: "assistant",
          content: turn.assistantText,
          createdAt: new Date().toISOString(),
          turn,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function handleEdit() {
    setDraft("");
    inputRef.current?.focus();
    // Soft hint in the field without sending.
    inputRef.current?.setAttribute(
      "placeholder",
      "Tell me what to change — people, dates, tone…",
    );
  }

  async function createFromSearch(
    mediaIds: string[],
    mode: "memory" | "movie",
    sourceTurn?: AssistantTurnView,
  ) {
    if (!conversationId || busy || mediaIds.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      const understanding = sourceTurn?.understanding;
      const res = await fetch(
        `/api/assistant/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(mode === "movie"
              ? { createMovieFromMediaIds: mediaIds }
              : { createMemoryFromMediaIds: mediaIds }),
            seedIntent: understanding
              ? {
                  action: "search_media",
                  people: understanding.people,
                  date_range: understanding.dateRange,
                  tone: understanding.tone,
                  qualities: understanding.qualities,
                  visual_query: understanding.visualQuery,
                  objects: understanding.objects,
                  scenes: understanding.scenes,
                  theme_preference: understanding.themePreference,
                  title_suggestion: understanding.titleSuggestion,
                  raw_prompt: sourceTurn?.assistantText,
                }
              : undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ??
            `Could not start a ${mode} from those items`,
        );
      }

      const data = (await res.json()) as { turn: AssistantTurnView };
      const turn = data.turn;

      setMessages((prev) => [
        ...prev,
        {
          id: turn.userMessageId || `user-${mode}-${Date.now()}`,
          role: "user",
          content:
            mode === "movie"
              ? "Create a movie from these items"
              : "Create a memory from these items",
          createdAt: new Date().toISOString(),
        },
        {
          id: turn.assistantMessageId || `assistant-${mode}-${Date.now()}`,
          role: "assistant",
          content: turn.assistantText,
          createdAt: new Date().toISOString(),
          turn,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  const isEmpty = messages.length === 0 && !booting;

  return (
    <div
        className={cn(
          "assistant-shell flex flex-col bg-canvas/90",
          isPanel
            ? "h-full min-h-0 flex-1 rounded-none border-0 shadow-none"
            : "min-h-[min(70vh,720px)] rounded-2xl border border-ink/10 shadow-[0_1px_0_rgba(42,40,37,0.04)]",
        )}
    >
      {!isPanel ? (
        <div className="border-b border-ink/8 px-4 py-3 sm:px-5">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Ava size="sm" className="!size-8" decorative />
            Ask AI
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Find photos, make a memory, or start a movie — in your own words.
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "assistant-chat-scroll flex-1 space-y-3 overflow-y-auto overscroll-contain",
          isPanel ? "space-y-2.5 px-3 py-3" : "space-y-4 px-4 py-5 sm:px-5",
        )}
      >
        {booting ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading conversation…
          </div>
        ) : null}

        {isEmpty ? (
          <AssistantEmptyState
            compact={isPanel}
            onPick={(p) => void sendMessage(p)}
          />
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "assistant-bubble rounded-2xl px-3.5 py-2.5",
                isPanel
                  ? "max-w-[min(100%,20rem)] text-[13px] leading-relaxed"
                  : "max-w-[min(100%,36rem)]",
                message.role === "user"
                  ? "assistant-bubble-user bg-accent text-accent-foreground"
                  : "assistant-bubble-assistant border border-ink/10 bg-canvas-deep/60 text-ink",
              )}
            >
              {message.role === "assistant" && message.turn ? (
                <AssistantTurnCard
                  turn={message.turn}
                  busy={busy}
                  compact={isPanel}
                  onConfirm={(id, mediaIds) =>
                    void confirmOrCancel(id, false, mediaIds)
                  }
                  onCancel={(id) => void confirmOrCancel(id, true)}
                  onEdit={handleEdit}
                  onCreateMemoryFromSearch={(mediaIds) =>
                    void createFromSearch(mediaIds, "memory", message.turn)
                  }
                  onCreateMovieFromSearch={(mediaIds) =>
                    void createFromSearch(mediaIds, "movie", message.turn)
                  }
                  onNavigateAway={onNavigateAway}
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </p>
              )}
            </div>
          </div>
        ))}

        {busy ? (
          <div
            className="assistant-typing flex items-center gap-2 rounded-2xl border border-ink/8 bg-canvas-deep/40 px-3 py-2 text-sm text-ink-muted"
            aria-live="polite"
          >
            <Ava size="sm" className="!size-7" decorative />
            <span className="inline-flex items-center gap-1.5">
              <span className="ask-ai-typing-dot" />
              <span className="ask-ai-typing-dot" />
              <span className="ask-ai-typing-dot" />
              <span className="sr-only">Thinking…</span>
            </span>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {error ? (
        <p
          className={cn(
            "border-t border-ink/8 py-2 text-sm text-red-700",
            isPanel ? "px-3" : "px-4 sm:px-5",
          )}
        >
          {error}
        </p>
      ) : null}

      <form
        className={cn(
          "assistant-composer border-t border-ink/8 bg-canvas/95",
          isPanel
            ? "ask-ai-panel-composer shrink-0 p-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]"
            : "p-3 sm:p-4",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(draft);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-ink/12 bg-canvas px-3 py-2 focus-within:border-accent/40">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={isPanel ? 1 : 2}
            enterKeyHint="send"
            autoComplete="off"
            disabled={busy || booting}
            placeholder={
              isPanel
                ? "Ask about photos, or how to use the vault…"
                : "Ask about a person, trip, or how to use the vault…"
            }
            className={cn(
              "max-h-28 flex-1 resize-none bg-transparent leading-relaxed text-ink outline-none placeholder:text-ink-muted/70 disabled:opacity-60",
              /* 16px on mobile avoids iOS focus zoom */
              isPanel
                ? "min-h-[2.5rem] text-base sm:min-h-[2.75rem] sm:text-sm"
                : "min-h-[2.75rem] text-sm",
            )}
          />
          <button
            type="submit"
            disabled={busy || booting || !draft.trim()}
            className="ui-btn ui-btn-primary size-10 shrink-0 !px-0"
            aria-label="Send message"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
          </button>
        </div>
        <p className="mt-1.5 hidden text-[11px] text-ink-muted sm:block">
          Enter to send · Shift+Enter for a new line
          {isPanel ? " · Esc to close" : ""}
        </p>
      </form>
    </div>
  );
}

function AssistantEmptyState({
  onPick,
  compact = false,
}: {
  onPick: (prompt: string) => void;
  compact?: boolean;
}) {
  const prompts = ASSISTANT_EXAMPLE_PROMPTS.slice(0, compact ? 4 : undefined);

  return (
    <div
      className={cn(
        "assistant-empty mx-auto text-center",
        compact ? "max-w-sm py-2" : "max-w-lg py-6",
      )}
    >
      <span className="ui-empty-icon mx-auto inline-flex">
        <Ava
          size="sm"
          className={cn(compact ? "!size-12" : "!size-16")}
          decorative
        />
      </span>
      <p
        className={cn(
          "ui-empty-title mt-3 font-display tracking-tight text-ink",
          compact ? "text-base" : "text-xl",
        )}
      >
        What would you like to find?
      </p>
      <p
        className={cn(
          "ui-empty-copy mt-1.5 leading-relaxed text-ink-muted",
          compact ? "text-xs" : "text-sm",
        )}
      >
        Ask for photos, make a memory, or get a quick how-to.
      </p>
      <div className={cn("flex flex-col gap-1.5", compact ? "mt-4" : "mt-6")}>
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="assistant-prompt list-card rounded-xl border border-ink/10 bg-canvas px-3.5 py-2.5 text-left text-[13px] text-ink transition hover:border-accent/35 hover:bg-accent/8"
          >
            “{prompt}”
          </button>
        ))}
      </div>
    </div>
  );
}

function apiMessageToChat(message: ApiMessage): AssistantChatMessage {
  const pending = message.metadata?.pendingProposal;
  const searchPreview = message.metadata?.searchPreview;
  const intent = message.metadata?.intent as
    | {
        action?: string;
        people?: string[];
        date_range?: { start?: string; end?: string; label?: string };
        tone?: string;
        qualities?: string[];
        visual_query?: string;
        objects?: string[];
        scenes?: string[];
        theme_preference?: string;
        title_suggestion?: string;
      }
    | null
    | undefined;

  const understanding: AssistantTurnView["understanding"] = intent
    ? {
        action: intent.action ?? "clarify",
        people: intent.people ?? [],
        dateRange: intent.date_range,
        tone: intent.tone,
        qualities: intent.qualities,
        visualQuery: intent.visual_query,
        objects: intent.objects,
        scenes: intent.scenes,
        themePreference: intent.theme_preference,
        titleSuggestion: intent.title_suggestion,
      }
    : null;

  if (message.role === "assistant" && pending && pending.status === "open") {
    const turn: AssistantTurnView = {
      conversationId: "",
      userMessageId: "",
      assistantMessageId: message.id,
      status: pending.stage === "preview" ? "preview" : "clarify",
      assistantText: message.content,
      understanding,
      clarifyingQuestions: pending.clarifyingQuestions ?? [],
      mediaPreview:
        pending.stage === "preview"
          ? {
              proposalId: pending.id,
              totalCount: pending.totalCount,
              mediaIds: pending.mediaIds,
              thumbnails: pending.sampleThumbnails,
              people: [],
              title: pending.titleSuggestion ?? undefined,
              theme: pending.themePreference ?? undefined,
            }
          : null,
      actionButtons: [],
      created: {
        memoryId: null,
        movieId: null,
        mediaIds: pending.mediaIds ?? [],
        links: [],
      },
      result: null,
      actionId: null,
    };

    return {
      id: message.id,
      role: "assistant",
      content: message.content,
      createdAt: message.createdAt,
      turn,
    };
  }

  if (message.role === "assistant" && searchPreview) {
    const people = searchPreview.people ?? [];
    const primary = people[0];
    const turn: AssistantTurnView = {
      conversationId: "",
      userMessageId: "",
      assistantMessageId: message.id,
      status: "completed",
      assistantText: message.content,
      understanding,
      clarifyingQuestions: [],
      mediaPreview: {
        totalCount: searchPreview.totalCount,
        mediaIds: searchPreview.mediaIds,
        thumbnails: searchPreview.sampleThumbnails,
        people,
        dateLabel: searchPreview.dateLabel,
      },
      actionButtons: primary
        ? [
            {
              id: "create-memory-from-search",
              label: "Create Memory",
              action: "create_memory_from_search",
              mediaIds: searchPreview.mediaIds,
            },
            {
              id: "create-movie-from-search",
              label: "Create Movie",
              action: "create_movie_from_search",
              mediaIds: searchPreview.mediaIds,
            },
            {
              id: `person-${primary.id}`,
              label: `View ${primary.name}'s media`,
              action: "browse_media",
              href: `/people/${primary.id}`,
            },
          ]
        : [
            {
              id: "create-memory-from-search",
              label: "Create Memory",
              action: "create_memory_from_search",
              mediaIds: searchPreview.mediaIds,
            },
            {
              id: "create-movie-from-search",
              label: "Create Movie",
              action: "create_movie_from_search",
              mediaIds: searchPreview.mediaIds,
            },
            {
              id: "browse-media",
              label: "View library",
              action: "browse_media",
              href: "/media",
            },
          ],
      created: {
        memoryId: null,
        movieId: null,
        mediaIds: searchPreview.mediaIds,
        links: [],
      },
      result: {
        type: "search_media",
        mediaIds: searchPreview.mediaIds,
        count: searchPreview.totalCount,
      },
      actionId: null,
    };

    return {
      id: message.id,
      role: "assistant",
      content: message.content,
      createdAt: message.createdAt,
      turn,
    };
  }

  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    createdAt: message.createdAt,
  };
}
