"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Film,
  HardDrive,
  ImageIcon,
  Loader2,
  Shield,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { playNotificationDing } from "@/lib/notifications/client-attention";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationBellProps = {
  initialUnreadCount: number;
};

const ICON_MAP: Record<string, typeof Bell> = {
  media_ready: ImageIcon,
  movie_ready: Film,
  family_invite: Users,
  storage_warning: HardDrive,
  moderation_attention: Shield,
};

/** Above page chrome / FABs so the inbox stays readable. */
const NOTIFICATION_PANEL_Z = 90;
/** Margin from viewport edges when clamping the portal panel. */
const VIEWPORT_EDGE = 8;
/** Preferred panel width (matches sm:w-96); shrinks on narrow screens. */
const PANEL_PREFERRED_WIDTH = 24 * 16;

type PanelPos = {
  top: number;
  left: number;
  width: number;
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function NotificationBell({
  initialUnreadCount,
}: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [attention, setAttention] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Last unread count we’ve already accounted for (SSR seed — no ding). */
  const knownUnreadRef = useRef(initialUnreadCount);
  const soundEnabledRef = useRef(true);
  /** Skip attention until after mount so SSR unread never “arrives”. */
  const liveRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    // Next tick: treat subsequent unread increases as live arrivals.
    const id = window.setTimeout(() => {
      liveRef.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Sound preference (default on); refresh when returning to the tab.
  useEffect(() => {
    let cancelled = false;
    async function loadSoundPref() {
      try {
        const res = await fetch("/api/settings/account");
        if (!res.ok) return;
        const data = (await res.json()) as {
          preferences?: { notificationSoundEnabled?: boolean };
        };
        if (cancelled) return;
        if (typeof data.preferences?.notificationSoundEnabled === "boolean") {
          soundEnabledRef.current = data.preferences.notificationSoundEnabled;
        }
      } catch {
        /* keep default */
      }
    }
    void loadSoundPref();
    function onVisible() {
      if (document.visibilityState === "visible") void loadSoundPref();
    }
    function onPrefEvent(e: Event) {
      const detail = (e as CustomEvent<{ enabled?: boolean }>).detail;
      if (typeof detail?.enabled === "boolean") {
        soundEnabledRef.current = detail.enabled;
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("fmv:notification-sound-pref", onPrefEvent);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("fmv:notification-sound-pref", onPrefEvent);
    };
  }, []);

  const applyUnreadCount = useCallback(
    (next: number, options?: { fromOpenPanel?: boolean }) => {
      const prev = knownUnreadRef.current;
      knownUnreadRef.current = next;
      setUnreadCount(next);

      if (next === 0) {
        setAttention(false);
        return;
      }

      // Opening the panel (or fetching while open) clears highlight; no ding.
      if (options?.fromOpenPanel || open) {
        setAttention(false);
        return;
      }

      if (!liveRef.current || next <= prev) return;

      setAttention(true);
      if (soundEnabledRef.current) {
        playNotificationDing();
      }
    },
    [open],
  );

  /**
   * Anchor the portal panel to the bell, choosing left vs right alignment from
   * the trigger’s horizontal position, then clamp so it never leaves the viewport.
   */
  const updatePanelPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_PREFERRED_WIDTH, vw - VIEWPORT_EDGE * 2);

    // Left-half trigger → open left-aligned; right-half → open right-aligned.
    const triggerCenterX = rect.left + rect.width / 2;
    const alignStart = triggerCenterX < vw / 2;

    let left = alignStart ? rect.left : rect.right - width;
    left = Math.min(
      Math.max(VIEWPORT_EDGE, left),
      Math.max(VIEWPORT_EDGE, vw - VIEWPORT_EDGE - width),
    );

    let top = rect.bottom + 8;
    const measuredHeight = panelRef.current?.offsetHeight ?? 0;
    if (measuredHeight > 0) {
      const maxTop = Math.max(
        VIEWPORT_EDGE,
        vh - VIEWPORT_EDGE - measuredHeight,
      );
      if (top > maxTop) {
        // Prefer flipping above the bell when there isn’t room below.
        const above = rect.top - measuredHeight - 8;
        top = above >= VIEWPORT_EDGE ? above : maxTop;
      }
    }

    setPanelPos({ top, left, width });
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: NotificationItem[];
        unreadCount: number;
      };
      setItems(data.items);
      applyUnreadCount(data.unreadCount, { fromOpenPanel: true });
    } finally {
      setLoading(false);
    }
  }, [applyUnreadCount]);

  // Fetch on open — also clear attention highlight.
  useEffect(() => {
    if (!open) return;
    setAttention(false);
    void fetchNotifications();
  }, [open, fetchNotifications]);

  // Keep fixed panel aligned to the bell (portal escapes header stacking).
  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("orientationchange", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", updatePanelPosition);
    vv?.addEventListener("scroll", updatePanelPosition);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("orientationchange", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
      vv?.removeEventListener("resize", updatePanelPosition);
      vv?.removeEventListener("scroll", updatePanelPosition);
    };
  }, [open, updatePanelPosition]);

  // Re-clamp after content loads (height changes) so portrait/landscape stay inside.
  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, loading, items.length, updatePanelPosition]);

  // Poll unread count every 60s when closed (and once when tab becomes visible).
  useEffect(() => {
    async function pollUnread() {
      if (open) return;
      try {
        const res = await fetch("/api/notifications?unread=1&limit=1");
        if (!res.ok) return;
        const data = (await res.json()) as { unreadCount: number };
        applyUnreadCount(data.unreadCount);
      } catch {
        /* swallow */
      }
    }

    const interval = setInterval(() => {
      void pollUnread();
    }, 60_000);

    function onVisible() {
      if (document.visibilityState === "visible") void pollUnread();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, applyUnreadCount]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  async function handleMarkRead(id: string) {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    const next = Math.max(0, unreadCount - 1);
    applyUnreadCount(next, { fromOpenPanel: true });
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function handleMarkAllRead() {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    applyUnreadCount(0, { fromOpenPanel: true });
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }

  function handleClickNotification(item: NotificationItem) {
    if (!item.readAt) void handleMarkRead(item.id);
    setOpen(false);
    if (!item.link) return;
    // Prefer in-app paths; ignore absolute URLs that would break the router.
    if (item.link.startsWith("http://") || item.link.startsWith("https://")) {
      try {
        const url = new URL(item.link);
        startTransition(() => router.push(`${url.pathname}${url.search}`));
      } catch {
        window.location.href = item.link;
      }
      return;
    }
    startTransition(() => router.push(item.link!));
  }

  const hasUnread = unreadCount > 0;

  const panel =
    open && mounted && panelPos
      ? createPortal(
          <div
            ref={panelRef}
            className="ui-popover fixed overflow-hidden rounded-xl border border-ink/10 bg-canvas shadow-lg"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              maxWidth: `calc(100vw - ${VIEWPORT_EDGE * 2}px)`,
              zIndex: NOTIFICATION_PANEL_Z,
            }}
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between border-b border-ink/8 px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Notifications</h2>
              <div className="flex items-center gap-2">
                {hasUnread ? (
                  <button
                    type="button"
                    onClick={() => void handleMarkAllRead()}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-accent-deep transition hover:bg-accent/10"
                  >
                    <CheckCheck className="size-3" aria-hidden />
                    Mark all read
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded p-1 text-ink-muted transition hover:bg-ink/5 hover:text-ink"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[min(24rem,70vh)] overflow-y-auto overscroll-contain">
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="size-5 animate-spin text-ink-muted" />
                </div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="mx-auto size-8 text-ink/20" aria-hidden />
                  <p className="mt-2 text-sm text-ink-muted">
                    No notifications yet
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    We&apos;ll let you know when something needs your attention.
                  </p>
                </div>
              ) : (
                <ul>
                  {items.map((item) => {
                    const Icon = ICON_MAP[item.type] ?? Bell;
                    const isUnread = !item.readAt;

                    return (
                      <li
                        key={item.id}
                        className="border-b border-ink/5 last:border-0"
                      >
                        <button
                          type="button"
                          onClick={() => handleClickNotification(item)}
                          className={cn(
                            "flex w-full gap-3 px-4 py-3 text-left transition hover:bg-ink/[0.03]",
                            isUnread && "bg-accent/[0.04]",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                              isUnread
                                ? "bg-accent/15 text-accent-deep"
                                : "bg-ink/5 text-ink-muted",
                            )}
                          >
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={cn(
                                  "truncate text-sm",
                                  isUnread
                                    ? "font-semibold text-ink"
                                    : "font-medium text-ink/80",
                                )}
                              >
                                {item.title}
                              </p>
                              {isUnread ? (
                                <span
                                  className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                                  aria-label="Unread"
                                />
                              ) : null}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                              {item.message}
                            </p>
                            <p className="mt-1 text-[11px] text-ink-muted/70">
                              {timeAgo(item.createdAt)}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {items.length > 0 ? (
              <div className="border-t border-ink/8 px-4 py-2.5 text-center">
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="text-xs font-medium text-accent-deep hover:text-accent"
                >
                  View all notifications
                </Link>
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "dashboard-icon-btn notification-bell-btn relative inline-flex items-center justify-center rounded-md border border-ink/10 bg-canvas p-2 text-ink-muted transition-colors hover:border-ink/20 hover:text-ink",
          open && "border-accent/30 text-accent-deep",
          attention && !open && "notification-bell-attention",
        )}
        aria-label={`Notifications${hasUnread ? ` (${unreadCount} unread)` : ""}${attention ? " — new" : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="size-4" />
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold leading-none text-accent-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {panel}
    </div>
  );
}
