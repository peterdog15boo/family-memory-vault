"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "fmv-ask-ai-conversation-id";

export type OpenAskAiOptions = {
  /** Prefill the composer (does not auto-send). */
  prompt?: string;
  /** Resume a specific conversation. */
  conversationId?: string | null;
  /** Clear the panel thread and start fresh (server history kept). */
  fresh?: boolean;
};

type AskAiContextValue = {
  open: boolean;
  minimized: boolean;
  /** Active panel conversation — persisted in sessionStorage while the tab lives. */
  conversationId: string | null;
  /** Bumps when the panel should focus the composer. */
  focusNonce: number;
  openAskAi: (options?: OpenAskAiOptions) => void;
  closeAskAi: () => void;
  minimizeAskAi: () => void;
  restoreAskAi: () => void;
  toggleAskAi: () => void;
  setConversationId: (id: string | null) => void;
  /** Take and clear a pending prefill prompt (once). */
  consumePendingPrompt: () => string | null;
};

const AskAiContext = createContext<AskAiContextValue | null>(null);

function readStoredConversationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(STORAGE_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function writeStoredConversationId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / blocked storage */
  }
}

export function AskAiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [conversationId, setConversationIdState] = useState<string | null>(
    () => readStoredConversationId(),
  );
  const [focusNonce, setFocusNonce] = useState(0);
  const pendingPromptRef = useRef<string | null>(null);

  const setConversationId = useCallback((id: string | null) => {
    setConversationIdState(id);
    writeStoredConversationId(id);
  }, []);

  const openAskAi = useCallback(
    (options?: OpenAskAiOptions) => {
      if (options?.fresh) {
        setConversationId(null);
      } else if (options?.conversationId !== undefined) {
        setConversationId(options.conversationId);
      }
      if (typeof options?.prompt === "string" && options.prompt.trim()) {
        pendingPromptRef.current = options.prompt.trim();
      }
      setMinimized(false);
      setOpen(true);
      setFocusNonce((n) => n + 1);
    },
    [setConversationId],
  );

  const closeAskAi = useCallback(() => {
    setOpen(false);
    setMinimized(false);
    // Keep conversationId in memory + sessionStorage so reopen resumes.
  }, []);

  const minimizeAskAi = useCallback(() => {
    setOpen(false);
    setMinimized(true);
  }, []);

  const restoreAskAi = useCallback(() => {
    setMinimized(false);
    setOpen(true);
    setFocusNonce((n) => n + 1);
  }, []);

  const toggleAskAi = useCallback(() => {
    if (open) {
      closeAskAi();
      return;
    }
    if (minimized) {
      restoreAskAi();
      return;
    }
    openAskAi();
  }, [open, minimized, closeAskAi, restoreAskAi, openAskAi]);

  const consumePendingPrompt = useCallback(() => {
    const prompt = pendingPromptRef.current;
    pendingPromptRef.current = null;
    return prompt;
  }, []);

  const value = useMemo(
    () => ({
      open,
      minimized,
      conversationId,
      focusNonce,
      openAskAi,
      closeAskAi,
      minimizeAskAi,
      restoreAskAi,
      toggleAskAi,
      setConversationId,
      consumePendingPrompt,
    }),
    [
      open,
      minimized,
      conversationId,
      focusNonce,
      openAskAi,
      closeAskAi,
      minimizeAskAi,
      restoreAskAi,
      toggleAskAi,
      setConversationId,
      consumePendingPrompt,
    ],
  );

  return (
    <AskAiContext.Provider value={value}>{children}</AskAiContext.Provider>
  );
}

export function useAskAi(): AskAiContextValue {
  const ctx = useContext(AskAiContext);
  if (!ctx) {
    throw new Error("useAskAi must be used within AskAiProvider");
  }
  return ctx;
}

/** Optional hook when provider may be absent (e.g. marketing pages). */
export function useAskAiOptional(): AskAiContextValue | null {
  return useContext(AskAiContext);
}
