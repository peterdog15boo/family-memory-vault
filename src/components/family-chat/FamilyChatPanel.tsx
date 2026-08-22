"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/nextjs";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  MessagesSquare,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useAskAi } from "@/components/assistant/AskAiContext";
import {
  readLastFamilyId,
  useFamilyChat,
} from "@/components/family-chat/FamilyChatContext";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { cn } from "@/lib/utils";

const MOBILE_MQ = "(max-width: 639px)";
const POLL_MS = 8_000;

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: {
    userId: string;
    displayName: string | null;
    imageUrl: string | null;
  };
};

type AccessPayload = {
  familyId: string;
  familyName: string;
  eligible: boolean;
  isOwner: boolean;
  unreadCount: number;
};

type FamilyOption = {
  familyId: string;
  familyName: string;
  isOwner: boolean;
  unreadCount: number;
};

type BootstrapPayload = {
  families?: FamilyOption[];
  access?: AccessPayload | null;
  totalUnread?: number;
};

type ThreadSummary = {
  id: string;
  familyId: string;
  updatedAt: string;
  unreadCount: number;
  title: string;
  lastMessage: {
    body: string;
    createdAt: string;
    senderUserId: string;
    senderName: string | null;
  } | null;
  participants: Array<{
    userId: string;
    displayName: string | null;
    imageUrl: string | null;
  }>;
};

type EligibleMember = {
  userId: string;
  memberId: string;
  displayName: string | null;
  imageUrl: string | null;
  invitedEmail: string | null;
  role: string;
};

type PanelView = "family-pick" | "list" | "compose" | "thread";

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function initials(name: string | null, fallback: string) {
  const source = (name || fallback || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function memberLabel(
  m: { displayName: string | null; invitedEmail?: string | null },
  fallback: string,
) {
  return m.displayName?.trim() || m.invitedEmail?.trim() || fallback;
}

/**
 * Family Chat slide-over. Closed by default; opens via icon or notification.
 * Multi-family users pick (or resume) a vault before seeing threads.
 */
export function FamilyChatPanel() {
  const {
    open,
    closeFamilyChat,
    pendingThreadId,
    pendingFamilyId,
    clearPendingOpen,
    setUnreadCount,
    setChatAvailable,
    setFamilyId,
    familyId,
  } = useFamilyChat();
  const { open: askAiOpen, closeAskAi } = useAskAi();
  const { userId: selfUserId } = useAuth();
  const t = useTranslations();

  const [mounted, setMounted] = useState(false);
  const [keepAlive, setKeepAlive] = useState(false);
  const [view, setView] = useState<PanelView>("list");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [families, setFamilies] = useState<FamilyOption[]>([]);
  const [eligible, setEligible] = useState<EligibleMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [activeThread, setActiveThread] = useState<ThreadSummary | null>(null);
  const [familyPickerOpen, setFamilyPickerOpen] = useState(false);
  /** When true, family pick is for starting a new chat after selection. */
  const composeAfterFamilyPickRef = useRef(false);

  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const familyIdRef = useRef<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (open && !keepAlive) {
    setKeepAlive(true);
  }

  useEffect(() => {
    if (open && askAiOpen) closeAskAi();
  }, [open, askAiOpen, closeAskAi]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const clearConversationState = useCallback(() => {
    setThreads([]);
    setMessages([]);
    setEligible([]);
    setSelectedIds(new Set());
    setActiveThread(null);
    activeThreadIdRef.current = null;
    setDraft("");
    setError(null);
    setFamilyPickerOpen(false);
  }, []);

  const applyAccess = useCallback(
    (access: AccessPayload, totalUnread?: number) => {
      setFamilyId(access.familyId);
      setFamilyName(access.familyName);
      familyIdRef.current = access.familyId;
      if (typeof totalUnread === "number") {
        setUnreadCount(totalUnread);
      } else {
        setUnreadCount(access.unreadCount);
      }
    },
    [setFamilyId, setUnreadCount],
  );

  const fetchBootstrap = useCallback(async (preferredFamilyId?: string | null) => {
    const qs = preferredFamilyId
      ? `?familyId=${encodeURIComponent(preferredFamilyId)}`
      : "";
    const response = await fetch(`/api/family/chat${qs}`);
    const data = (await response.json().catch(() => ({}))) as BootstrapPayload & {
      error?: string;
    };
    if (!response.ok) {
      setChatAvailable(false);
      return null;
    }
    const list = data.families ?? [];
    setFamilies(list);
    const eligibleFamilies = list;
    if (eligibleFamilies.length === 0 || !data.access?.eligible) {
      setChatAvailable(false);
      setUnreadCount(data.totalUnread ?? 0);
      setFamilyId(null);
      familyIdRef.current = null;
      setFamilyName("");
      return null;
    }
    setChatAvailable(true);
    applyAccess(data.access, data.totalUnread);
    return {
      families: eligibleFamilies,
      access: data.access,
      totalUnread: data.totalUnread ?? 0,
    };
  }, [applyAccess, setChatAvailable, setFamilyId, setUnreadCount]);

  const loadThreads = useCallback(
    async (fid: string) => {
      const response = await fetch(
        `/api/family/chat/threads?familyId=${encodeURIComponent(fid)}`,
      );
      const data = (await response.json().catch(() => ({}))) as {
        threads?: ThreadSummary[];
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        if (data.code === "excluded") {
          setChatAvailable(false);
          closeFamilyChat();
        }
        throw new Error(data.error || t("familyChat.loadError"));
      }
      // Guard against stale responses after a family switch.
      if (familyIdRef.current && familyIdRef.current !== fid) {
        return [];
      }
      setThreads(data.threads ?? []);
      return data.threads ?? [];
    },
    [closeFamilyChat, setChatAvailable, t],
  );

  const loadEligible = useCallback(
    async (fid: string) => {
      const response = await fetch(
        `/api/family/chat/eligible?familyId=${encodeURIComponent(fid)}`,
      );
      const data = (await response.json().catch(() => ({}))) as {
        members?: EligibleMember[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("familyChat.loadError"));
      }
      if (familyIdRef.current && familyIdRef.current !== fid) {
        return [];
      }
      const members = data.members ?? [];
      setEligible(members);
      setSelectedIds(new Set(members.map((m) => m.userId)));
      return members;
    },
    [t],
  );

  const openThread = useCallback(
    async (thread: ThreadSummary, silent = false) => {
      // Reject cross-family thread opens.
      if (
        familyIdRef.current &&
        thread.familyId &&
        thread.familyId !== familyIdRef.current
      ) {
        setError(t("familyChat.loadError"));
        return;
      }
      activeThreadIdRef.current = thread.id;
      setActiveThread(thread);
      setView("thread");
      setError(null);
      if (!silent) setLoading(true);
      try {
        const response = await fetch(
          `/api/family/chat/messages?threadId=${encodeURIComponent(thread.id)}`,
        );
        const data = (await response.json().catch(() => ({}))) as {
          messages?: ChatMessage[];
          error?: string;
          code?: string;
        };
        if (!response.ok) {
          if (data.code === "excluded" || data.code === "forbidden") {
            setError(data.error || t("familyChat.loadError"));
            return;
          }
          throw new Error(data.error || t("familyChat.loadError"));
        }
        if (
          familyIdRef.current &&
          thread.familyId &&
          thread.familyId !== familyIdRef.current
        ) {
          return;
        }
        setMessages(data.messages ?? []);
        await fetch("/api/family/chat/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: thread.id }),
        }).catch(() => null);
        setThreads((prev) =>
          prev.map((row) =>
            row.id === thread.id ? { ...row, unreadCount: 0 } : row,
          ),
        );
        void fetchBootstrap(familyIdRef.current);
        requestAnimationFrame(scrollToBottom);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("familyChat.loadError"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [fetchBootstrap, scrollToBottom, t],
  );

  const selectFamily = useCallback(
    async (
      nextFamilyId: string,
      options?: { openCompose?: boolean },
    ) => {
      clearConversationState();
      setLoading(true);
      setError(null);
      try {
        const boot = await fetchBootstrap(nextFamilyId);
        if (!boot?.access) {
          closeFamilyChat();
          return;
        }
        await loadThreads(boot.access.familyId);
        if (options?.openCompose) {
          await loadEligible(boot.access.familyId);
          setView("compose");
        } else {
          setView("list");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("familyChat.loadError"));
      } finally {
        setLoading(false);
        composeAfterFamilyPickRef.current = false;
      }
    },
    [
      clearConversationState,
      closeFamilyChat,
      fetchBootstrap,
      loadEligible,
      loadThreads,
      t,
    ],
  );

  // Badge bootstrap while closed — never auto-opens the panel.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const preferred = readLastFamilyId();
        await fetchBootstrap(preferred);
      } catch {
        if (!cancelled) setChatAvailable(false);
      }
    })();
    const id = window.setInterval(() => {
      void fetchBootstrap(familyIdRef.current || readLastFamilyId());
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [fetchBootstrap, setChatAvailable]);

  // When opened: resolve family (picker / last-used / notification) then threads.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      setError(null);
      setLoading(true);
      clearConversationState();
      try {
        let wantThread = pendingThreadId;
        let wantFamily = pendingFamilyId;
        clearPendingOpen();

        // Notification without familyId: resolve from thread.
        if (wantThread && !wantFamily) {
          const res = await fetch(
            `/api/family/chat/threads/${encodeURIComponent(wantThread)}`,
          );
          const data = (await res.json().catch(() => ({}))) as {
            thread?: { familyId: string; threadId: string };
          };
          if (res.ok && data.thread) {
            wantFamily = data.thread.familyId;
            wantThread = data.thread.threadId;
          }
        }

        const preferred =
          wantFamily || familyIdRef.current || readLastFamilyId();
        const boot = await fetchBootstrap(preferred);
        if (cancelled) return;
        if (!boot?.access) {
          closeFamilyChat();
          return;
        }

        const multi = boot.families.length > 1;
        const lastUsed = readLastFamilyId();
        const lastUsedValid = Boolean(
          lastUsed &&
            boot.families.some((f) => f.familyId === lastUsed),
        );

        // Multi-family with no remembered choice and no deep-link → pick first.
        if (multi && !wantFamily && !wantThread && !lastUsedValid) {
          setView("family-pick");
          setLoading(false);
          return;
        }

        // Ensure selected family matches deep-link / last-used when needed.
        if (
          wantFamily &&
          boot.access.familyId !== wantFamily &&
          boot.families.some((f) => f.familyId === wantFamily)
        ) {
          const again = await fetchBootstrap(wantFamily);
          if (cancelled || !again?.access) return;
          await loadThreads(again.access.familyId);
          if (wantThread) {
            const list = await loadThreads(again.access.familyId);
            if (cancelled) return;
            const match = list.find((row) => row.id === wantThread);
            await openThread(
              match ?? {
                id: wantThread,
                familyId: again.access.familyId,
                updatedAt: new Date().toISOString(),
                unreadCount: 0,
                title: t("familyChat.title"),
                lastMessage: null,
                participants: [],
              },
            );
            return;
          }
          setView("list");
          return;
        }

        await loadThreads(boot.access.familyId);
        if (cancelled) return;

        if (wantThread) {
          const list = await loadThreads(boot.access.familyId);
          if (cancelled) return;
          const match = list.find((row) => row.id === wantThread);
          await openThread(
            match ?? {
              id: wantThread,
              familyId: boot.access.familyId,
              updatedAt: new Date().toISOString(),
              unreadCount: 0,
              title: t("familyChat.title"),
              lastMessage: null,
              participants: [],
            },
          );
          return;
        }

        setView("list");
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t("familyChat.loadError"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const poll = window.setInterval(() => {
      const fid = familyIdRef.current;
      const tid = activeThreadIdRef.current;
      if (!fid) return;
      if (tid) {
        void openThread(
          {
            id: tid,
            familyId: fid,
            updatedAt: new Date().toISOString(),
            unreadCount: 0,
            title: t("familyChat.title"),
            lastMessage: null,
            participants: [],
          },
          true,
        );
      } else if (view === "list") {
        void loadThreads(fid);
      }
      void fetchBootstrap(fid);
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open/pending drive bootstrap
  }, [open, pendingThreadId, pendingFamilyId]);

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(MOBILE_MQ);
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;

    function lockScrollIfMobile() {
      if (mq.matches) {
        document.body.style.overflow = "hidden";
        document.body.style.touchAction = "none";
      } else {
        document.body.style.overflow = prevOverflow;
        document.body.style.touchAction = prevTouchAction;
      }
    }

    function syncViewport() {
      const root = rootRef.current;
      const vv = window.visualViewport;
      if (!root || !vv) return;
      if (!mq.matches) {
        root.style.removeProperty("--family-chat-vv-height");
        root.style.removeProperty("--family-chat-vv-offset");
        return;
      }
      root.style.setProperty(
        "--family-chat-vv-height",
        `${Math.round(vv.height)}px`,
      );
      root.style.setProperty(
        "--family-chat-vv-offset",
        `${Math.round(vv.offsetTop)}px`,
      );
    }

    lockScrollIfMobile();
    syncViewport();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    mq.addEventListener("change", lockScrollIfMobile);
    mq.addEventListener("change", syncViewport);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      mq.removeEventListener("change", lockScrollIfMobile);
      mq.removeEventListener("change", syncViewport);
    };
  }, [open]);

  useOverlayA11y({
    open,
    onClose: closeFamilyChat,
    containerRef: panelRef,
    lockScroll: false,
    initialFocus: "container",
  });

  async function startCompose() {
    // Multi-family: confirm which vault before picking recipients.
    if (families.length > 1) {
      composeAfterFamilyPickRef.current = true;
      setView("family-pick");
      setActiveThread(null);
      activeThreadIdRef.current = null;
      setMessages([]);
      return;
    }
    const fid = familyId || familyIdRef.current;
    if (!fid) return;
    setError(null);
    setLoading(true);
    try {
      await loadEligible(fid);
      setView("compose");
      setActiveThread(null);
      activeThreadIdRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("familyChat.loadError"));
    } finally {
      setLoading(false);
    }
  }

  async function createThread() {
    const fid = familyId || familyIdRef.current;
    if (!fid || selectedIds.size === 0 || creating) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/family/chat/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId: fid,
          participantUserIds: [...selectedIds],
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        thread?: ThreadSummary;
        error?: string;
      };
      if (!response.ok || !data.thread) {
        throw new Error(data.error || t("familyChat.createError"));
      }
      if (data.thread.familyId !== fid) {
        throw new Error(t("familyChat.loadError"));
      }
      setThreads((prev) => {
        const without = prev.filter((row) => row.id !== data.thread!.id);
        return [data.thread!, ...without];
      });
      await openThread(data.thread);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("familyChat.createError"),
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleSend(event?: FormEvent) {
    event?.preventDefault();
    const tid = activeThread?.id || activeThreadIdRef.current;
    const body = draft.trim();
    if (!tid || !body || sending) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/family/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: tid, body }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: ChatMessage;
        error?: string;
      };
      if (!response.ok || !data.message) {
        throw new Error(data.error || t("familyChat.sendError"));
      }
      setDraft("");
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message!.id)) return prev;
        return [...prev, data.message!];
      });
      requestAnimationFrame(scrollToBottom);
      void fetchBootstrap(familyIdRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("familyChat.sendError"));
    } finally {
      setSending(false);
      composerRef.current?.focus();
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  if (!mounted || (!open && !keepAlive)) return null;

  const fallbackName = t("familyChat.memberFallback");
  const multiFamily = families.length > 1;
  const headerTitle =
    view === "family-pick"
      ? t("familyChat.chooseFamily")
      : view === "compose"
        ? t("familyChat.newChat")
        : view === "thread" && activeThread
          ? activeThread.title || t("familyChat.title")
          : t("familyChat.title");

  return createPortal(
    <div
      ref={rootRef}
      className={cn("family-chat-panel-root", open ? "is-open" : "is-closed")}
      aria-hidden={!open}
    >
      {open ? (
        <button
          type="button"
          className="family-chat-panel-backdrop"
          aria-label={t("familyChat.close")}
          onClick={closeFamilyChat}
        />
      ) : null}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        className="family-chat-panel"
      >
        <header className="family-chat-panel-header">
          <div className="flex min-w-0 items-start gap-2">
            {view !== "list" && view !== "family-pick" ? (
              <button
                type="button"
                className="family-chat-panel-icon-btn"
                onClick={() => {
                  setView("list");
                  setActiveThread(null);
                  activeThreadIdRef.current = null;
                  setMessages([]);
                  setError(null);
                  const fid = familyIdRef.current;
                  if (fid) void loadThreads(fid);
                }}
                aria-label={t("familyChat.back")}
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 id={titleId} className="family-chat-panel-title">
                {headerTitle}
              </h2>
              {view !== "family-pick" && familyName ? (
                multiFamily ? (
                  <div className="relative mt-0.5">
                    <button
                      type="button"
                      className="family-chat-family-switch"
                      aria-expanded={familyPickerOpen}
                      aria-haspopup="listbox"
                      onClick={() => setFamilyPickerOpen((v) => !v)}
                    >
                      <span className="truncate">
                        {t("familyChat.subtitleNamed", { name: familyName })}
                      </span>
                      <ChevronDown className="size-3.5 shrink-0" aria-hidden />
                    </button>
                    {familyPickerOpen ? (
                      <ul
                        className="family-chat-family-menu"
                        role="listbox"
                        aria-label={t("familyChat.chooseFamily")}
                      >
                        {families.map((f) => (
                          <li key={f.familyId} role="option" aria-selected={f.familyId === familyId}>
                            <button
                              type="button"
                              className={cn(
                                "family-chat-family-menu-item",
                                f.familyId === familyId && "is-active",
                              )}
                              onClick={() => {
                                setFamilyPickerOpen(false);
                                if (f.familyId !== familyIdRef.current) {
                                  void selectFamily(f.familyId);
                                }
                              }}
                            >
                              <span className="truncate">{f.familyName}</span>
                              {f.unreadCount > 0 ? (
                                <span className="family-chat-fab-badge">
                                  {f.unreadCount > 99 ? "99+" : f.unreadCount}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <p className="family-chat-panel-subtitle">
                    {t("familyChat.subtitleNamed", { name: familyName })}
                  </p>
                )
              ) : (
                <p className="family-chat-panel-subtitle">
                  {view === "family-pick"
                    ? t("familyChat.chooseFamilyLead")
                    : t("familyChat.subtitle")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {view === "list" ? (
              <button
                type="button"
                className="family-chat-panel-icon-btn"
                onClick={() => void startCompose()}
                aria-label={t("familyChat.newChat")}
                title={t("familyChat.newChat")}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="family-chat-panel-icon-btn"
              onClick={closeFamilyChat}
              aria-label={t("familyChat.close")}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        <div
          ref={listRef}
          className={cn(
            "family-chat-panel-body",
            view === "compose" && "family-chat-panel-body--compose",
          )}
        >
          {loading && (view === "list" || view === "family-pick") && threads.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-10 text-ink-muted">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </div>
          ) : null}

          {view === "family-pick" && !loading ? (
            <ul className="family-chat-thread-list">
              {families.map((f) => (
                <li key={f.familyId}>
                  <button
                    type="button"
                    className="family-chat-thread-row"
                    onClick={() =>
                      void selectFamily(f.familyId, {
                        openCompose: composeAfterFamilyPickRef.current,
                      })
                    }
                  >
                    <div className="min-w-0 flex-1 text-left">
                      <span className="truncate text-sm font-medium text-ink">
                        {f.familyName}
                      </span>
                      {f.unreadCount > 0 ? (
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {t("familyChat.openWithUnread", {
                            count: f.unreadCount,
                          })}
                        </p>
                      ) : null}
                    </div>
                    {f.unreadCount > 0 ? (
                      <span className="family-chat-fab-badge">
                        {f.unreadCount > 99 ? "99+" : f.unreadCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {view === "list" && !loading ? (
            threads.length === 0 ? (
              <div className="family-chat-empty">
                <p>{t("familyChat.emptyList")}</p>
                <button
                  type="button"
                  className="family-chat-empty-cta"
                  onClick={() => void startCompose()}
                >
                  <MessagesSquare className="size-4" aria-hidden />
                  {t("familyChat.newChat")}
                </button>
              </div>
            ) : (
              <ul className="family-chat-thread-list">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className="family-chat-thread-row"
                      onClick={() => void openThread(thread)}
                    >
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-ink">
                            {thread.title}
                          </span>
                          {thread.unreadCount > 0 ? (
                            <span className="inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-accent px-1 text-[0.65rem] font-semibold leading-4 text-accent-foreground">
                              {thread.unreadCount > 99
                                ? "99+"
                                : thread.unreadCount}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {thread.lastMessage?.body ||
                            t("familyChat.noMessagesYet")}
                        </p>
                      </div>
                      {thread.lastMessage ? (
                        <time
                          className="shrink-0 text-[0.65rem] text-ink-muted"
                          dateTime={thread.lastMessage.createdAt}
                        >
                          {formatTime(thread.lastMessage.createdAt)}
                        </time>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {view === "compose" ? (
            <div className="family-chat-compose">
              {multiFamily && familyName ? (
                <p className="family-chat-compose-family">
                  {t("familyChat.chattingIn", { name: familyName })}
                </p>
              ) : null}
              <p className="family-chat-compose-lead">
                {t("familyChat.composeLead")}
              </p>
              <div className="family-chat-compose-actions">
                <button
                  type="button"
                  className="family-chat-text-btn"
                  onClick={() =>
                    setSelectedIds(new Set(eligible.map((m) => m.userId)))
                  }
                >
                  {t("familyChat.selectAll")}
                </button>
                <button
                  type="button"
                  className="family-chat-text-btn"
                  onClick={() => setSelectedIds(new Set())}
                >
                  {t("familyChat.clearAll")}
                </button>
              </div>
              {eligible.length === 0 ? (
                <p className="mt-4 text-sm text-ink-muted">
                  {t("familyChat.noEligibleMembers")}
                </p>
              ) : (
                <ul className="family-chat-recipient-list">
                  {eligible.map((member) => {
                    const checked = selectedIds.has(member.userId);
                    const name = memberLabel(member, fallbackName);
                    return (
                      <li key={member.userId}>
                        <label className="family-chat-recipient-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(member.userId)) {
                                  next.delete(member.userId);
                                } else {
                                  next.add(member.userId);
                                }
                                return next;
                              });
                            }}
                          />
                          <span
                            className="family-chat-avatar"
                            aria-hidden
                            style={
                              member.imageUrl
                                ? {
                                    backgroundImage: `url(${member.imageUrl})`,
                                  }
                                : undefined
                            }
                          >
                            {!member.imageUrl
                              ? initials(member.displayName, name)
                              : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">
                            {name}
                          </span>
                          {checked ? (
                            <Check
                              className="size-4 shrink-0 text-accent-deep"
                              aria-hidden
                            />
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                className="family-chat-primary-btn"
                disabled={selectedIds.size === 0 || creating}
                onClick={() => void createThread()}
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                {t("familyChat.startChat")}
              </button>
            </div>
          ) : null}

          {view === "thread" ? (
            loading && messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-10 text-ink-muted">
                <Loader2 className="size-5 animate-spin" aria-hidden />
              </div>
            ) : messages.length === 0 ? (
              <div className="family-chat-empty">
                <p>{t("familyChat.empty")}</p>
              </div>
            ) : (
              <ul className="family-chat-message-list">
                {messages.map((message) => {
                  const mine =
                    selfUserId != null &&
                    message.sender.userId === selfUserId;
                  const name =
                    message.sender.displayName?.trim() || fallbackName;
                  return (
                    <li
                      key={message.id}
                      className={cn(
                        "family-chat-message",
                        mine && "family-chat-message--mine",
                      )}
                    >
                      <div
                        className="family-chat-avatar"
                        aria-hidden
                        style={
                          message.sender.imageUrl
                            ? {
                                backgroundImage: `url(${message.sender.imageUrl})`,
                              }
                            : undefined
                        }
                      >
                        {!message.sender.imageUrl
                          ? initials(message.sender.displayName, name)
                          : null}
                      </div>
                      <div className="family-chat-bubble-wrap">
                        <div className="family-chat-meta">
                          <span className="family-chat-sender">{name}</span>
                          <time dateTime={message.createdAt}>
                            {formatTime(message.createdAt)}
                          </time>
                        </div>
                        <p className="family-chat-bubble">{message.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </div>

        {error ? (
          <p className="family-chat-error" role="alert">
            {error}
          </p>
        ) : null}

        {view === "thread" ? (
          <form className="family-chat-composer" onSubmit={handleSend}>
            <label className="sr-only" htmlFor="family-chat-input">
              {t("familyChat.composerLabel")}
            </label>
            <textarea
              id="family-chat-input"
              ref={composerRef}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={t("familyChat.placeholder")}
              maxLength={2000}
              disabled={sending || !activeThread}
              className="family-chat-input"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim() || !activeThread}
              className="family-chat-send"
              aria-label={t("familyChat.send")}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </button>
          </form>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
