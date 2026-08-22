"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const FAMILY_CHAT_OPEN_EVENT = "fmv:open-family-chat";
export const FAMILY_CHAT_LAST_FAMILY_KEY = "fmv-family-chat-family-id";

export type OpenFamilyChatDetail = {
  threadId?: string | null;
  familyId?: string | null;
};

type FamilyChatContextValue = {
  open: boolean;
  pendingThreadId: string | null;
  pendingFamilyId: string | null;
  clearPendingOpen: () => void;
  openFamilyChat: (options?: OpenFamilyChatDetail) => void;
  closeFamilyChat: () => void;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  chatAvailable: boolean;
  setChatAvailable: (available: boolean) => void;
  familyId: string | null;
  setFamilyId: (id: string | null) => void;
};

const FamilyChatContext = createContext<FamilyChatContextValue | null>(null);

function parseOpenTargetFromHash(hash: string): {
  threadId: string | null;
  familyId: string | null;
} {
  const threadMatch = hash.match(/family-chat=([^&]+)/);
  const familyMatch = hash.match(/[?&]family=([^&]+)/);
  let threadId: string | null = null;
  let familyId: string | null = null;
  if (threadMatch?.[1]) {
    try {
      threadId = decodeURIComponent(threadMatch[1]);
    } catch {
      threadId = threadMatch[1];
    }
  }
  if (familyMatch?.[1]) {
    try {
      familyId = decodeURIComponent(familyMatch[1]);
    } catch {
      familyId = familyMatch[1];
    }
  }
  return { threadId, familyId };
}

export function readLastFamilyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(FAMILY_CHAT_LAST_FAMILY_KEY);
  } catch {
    return null;
  }
}

export function writeLastFamilyId(familyId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (familyId) localStorage.setItem(FAMILY_CHAT_LAST_FAMILY_KEY, familyId);
    else localStorage.removeItem(FAMILY_CHAT_LAST_FAMILY_KEY);
  } catch {
    /* private mode */
  }
}

export function FamilyChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [pendingFamilyId, setPendingFamilyId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatAvailable, setChatAvailable] = useState(false);
  const [familyId, setFamilyIdState] = useState<string | null>(null);

  const setFamilyId = useCallback((id: string | null) => {
    setFamilyIdState(id);
    writeLastFamilyId(id);
  }, []);

  const clearPendingOpen = useCallback(() => {
    setPendingThreadId(null);
    setPendingFamilyId(null);
  }, []);

  const openFamilyChat = useCallback((options?: OpenFamilyChatDetail) => {
    if (options?.threadId) setPendingThreadId(options.threadId);
    if (options?.familyId) setPendingFamilyId(options.familyId);
    setOpen(true);
  }, []);

  const closeFamilyChat = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    function onOpenEvent(event: Event) {
      const detail = (event as CustomEvent<OpenFamilyChatDetail>).detail;
      openFamilyChat({
        threadId: detail?.threadId ?? null,
        familyId: detail?.familyId ?? null,
      });
    }

    function applyHash() {
      const target = parseOpenTargetFromHash(window.location.hash);
      if (!target.threadId && !target.familyId) return;
      openFamilyChat(target);
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(null, "", url.pathname + url.search);
    }

    window.addEventListener(FAMILY_CHAT_OPEN_EVENT, onOpenEvent);
    window.addEventListener("hashchange", applyHash);
    if (typeof window !== "undefined") {
      applyHash();
    }

    return () => {
      window.removeEventListener(FAMILY_CHAT_OPEN_EVENT, onOpenEvent);
      window.removeEventListener("hashchange", applyHash);
    };
  }, [openFamilyChat]);

  const value = useMemo(
    () => ({
      open,
      pendingThreadId,
      pendingFamilyId,
      clearPendingOpen,
      openFamilyChat,
      closeFamilyChat,
      unreadCount,
      setUnreadCount,
      chatAvailable,
      setChatAvailable,
      familyId,
      setFamilyId,
    }),
    [
      open,
      pendingThreadId,
      pendingFamilyId,
      clearPendingOpen,
      openFamilyChat,
      closeFamilyChat,
      unreadCount,
      chatAvailable,
      familyId,
      setFamilyId,
    ],
  );

  return (
    <FamilyChatContext.Provider value={value}>
      {children}
    </FamilyChatContext.Provider>
  );
}

export function useFamilyChat() {
  const ctx = useContext(FamilyChatContext);
  if (!ctx) {
    throw new Error("useFamilyChat must be used within FamilyChatProvider");
  }
  return ctx;
}

export function dispatchOpenFamilyChat(
  threadId: string,
  familyId?: string | null,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenFamilyChatDetail>(FAMILY_CHAT_OPEN_EVENT, {
      detail: { threadId, familyId: familyId ?? null },
    }),
  );
}

export function parseFamilyChatOpenFromLink(
  link: string | null | undefined,
): { threadId: string | null; familyId: string | null } {
  if (!link) return { threadId: null, familyId: null };
  return parseOpenTargetFromHash(link.includes("#") ? link.slice(link.indexOf("#")) : link);
}

/** @deprecated Prefer parseFamilyChatOpenFromLink */
export function parseFamilyChatThreadIdFromLink(
  link: string | null | undefined,
): string | null {
  return parseFamilyChatOpenFromLink(link).threadId;
}
