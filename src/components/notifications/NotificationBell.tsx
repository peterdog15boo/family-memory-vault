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
  BookHeart,
  CalendarDays,
  Film,
  HardDrive,
  ImageIcon,
  Loader2,
  Shield,
  Heart,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { playNotificationDing } from "@/lib/notifications/client-attention";
import { openNotificationDestination } from "@/lib/notifications/open";
import {
  useLocale,
  useTranslations,
} from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { formatDate, type TranslateFn } from "@/lib/i18n";
import {
  computeNotificationPanelPos,
  type NotificationPanelPos,
} from "@/components/notifications/notification-panel-position";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type NotificationBellProps = {
  initialUnreadCount: number;
};

const ICON_MAP: Record<string, typeof Bell> = {
  media_ready: ImageIcon,
  movie_ready: Film,
  memory_created: BookHeart,
  family_invite: Users,
  family_milestone: Users,
  family_chat: Users,
  photo_request: ImageIcon,
  weekly_digest: CalendarDays,
  legacy_milestone: Heart,
  storage_warning: HardDrive,
  moderation_attention: Shield,
};

type PanelPos = NotificationPanelPos;

function timeAgo(dateStr: string, t: TranslateFn, locale: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return t("notifications.ui.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return t("notifications.ui.minutesAgo", { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.ui.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("notifications.ui.daysAgo", { count: days });
  return formatDate(dateStr, locale, { month: "short", day: "numeric" });
}

export function NotificationBell({
  initialUnreadCount,
}: NotificationBellProps) {
  const t = useTranslations();
  const { locale } = useLocale();
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
  const openRef = useRef(open);
  openRef.current = open;

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
      if (options?.fromOpenPanel || openRef.current) {
        setAttention(false);
        return;
      }

      if (!liveRef.current || next <= prev) return;

      setAttention(true);
      // Sound is optional; the unread badge + attention highlight are always
      // the primary cue. Skip ding when the user prefers reduced motion.
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (soundEnabledRef.current && !reduceMotion) {
        playNotificationDing();
      }
    },
    [],
  );

  /**
   * Anchor the portal panel to the bell. Narrow viewports get a full-width
   * sheet under the header; desktop stays right-aligned when the bell is on
   * the right. Always clamp inside the viewport.
   */
  const updatePanelPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    setPanelPos(
      computeNotificationPanelPos({
        trigger: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
        },
        vw: window.innerWidth,
        vh: window.innerHeight,
        panelHeight: panelRef.current?.offsetHeight ?? 0,
      }),
    );
  }, []);

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    // Measure before paint so the portal is not gated on a null panelPos
    // (which left the click looking like a no-op when layout lagged).
    updatePanelPosition();
    setOpen(true);
  }

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

  /**
   * Live unread from the API — not the SSR/router-cache seed.
   * Critical after Admin ↔ app remounts, which can restore a stale
   * `initialUnreadCount` and otherwise resurrect already-read badges.
   */
  const syncUnreadFromServer = useCallback(
    async (options?: { fromOpenPanel?: boolean }) => {
      try {
        const res = await fetch("/api/notifications?unread=1&limit=1");
        if (!res.ok) return;
        const data = (await res.json()) as { unreadCount: number };
        applyUnreadCount(data.unreadCount, {
          fromOpenPanel: options?.fromOpenPanel,
        });
      } catch {
        /* swallow */
      }
    },
    [applyUnreadCount],
  );

  // Always reconcile with DB on mount (covers Admin → app remount).
  useEffect(() => {
    void syncUnreadFromServer();
  }, [syncUnreadFromServer]);

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

  // Poll unread count every 60s when closed (and when the tab/page is shown again).
  useEffect(() => {
    const interval = setInterval(() => {
      if (open) return;
      void syncUnreadFromServer();
    }, 60_000);

    function onVisible() {
      if (document.visibilityState === "visible" && !open) {
        void syncUnreadFromServer();
      }
    }
    function onPageShow() {
      if (!open) void syncUnreadFromServer();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [open, syncUnreadFromServer]);

  // Close on outside pointer — backdrop handles most cases; this covers
  // clicks that miss the transparent scrim (e.g. into other portaled UI).
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useOverlayA11y({
    open,
    onClose: () => setOpen(false),
    containerRef: panelRef,
    lockScroll: false,
  });

  async function handleMarkRead(id: string) {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    const next = Math.max(0, unreadCount - 1);
    applyUnreadCount(next, { fromOpenPanel: true });
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { unreadCount?: number };
        if (typeof data.unreadCount === "number") {
          applyUnreadCount(data.unreadCount, { fromOpenPanel: true });
        }
        // Drop stale app-layout RSC seed so Admin → app doesn’t restore old badge.
        startTransition(() => router.refresh());
      }
    } catch {
      void syncUnreadFromServer({ fromOpenPanel: true });
    }
  }

  async function handleMarkAllRead() {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    applyUnreadCount(0, { fromOpenPanel: true });
    try {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        applyUnreadCount(0, { fromOpenPanel: true });
        startTransition(() => router.refresh());
      }
    } catch {
      void syncUnreadFromServer({ fromOpenPanel: true });
    }
  }

  function handleClickNotification(item: NotificationItem) {
    if (!item.readAt) void handleMarkRead(item.id);
    setOpen(false);
    void openNotificationDestination(
      { ...item, readAt: item.readAt ?? new Date().toISOString() },
      {
        missingMovieMessage: t("notifications.ui.movieMissing"),
        push: (href) => {
          startTransition(() => router.push(href));
        },
      },
    );
  }

  const hasUnread = unreadCount > 0;

  const panel =
    open && mounted
      ? createPortal(
          <>
            {/* Transparent scrim — closes on backdrop tap; stays under the panel. */}
            <div
              data-app-portal=""
              className="fixed inset-0 z-[200] bg-transparent"
              aria-hidden
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              data-app-portal=""
              className="ui-popover notification-bell-panel fixed overflow-hidden rounded-xl border border-ink/10 bg-canvas shadow-lg"
              style={{
                top: panelPos?.top ?? 0,
                left: panelPos?.left ?? 8,
                width: panelPos?.width ?? `calc(100vw - 16px)`,
                maxWidth: "calc(100vw - 16px)",
                maxHeight: "min(24rem, calc(100vh - 16px))",
                visibility: panelPos ? "visible" : "hidden",
                zIndex: 201,
              }}
              role="dialog"
              aria-modal="true"
              aria-label={t("notifications.ui.title")}
              tabIndex={-1}
            >
              <div className="flex items-center justify-between border-b border-ink/8 px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">
                  {t("notifications.ui.title")}
                </h2>
                <div className="flex items-center gap-2">
                  {hasUnread ? (
                    <button
                      type="button"
                      onClick={() => void handleMarkAllRead()}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-accent-deep transition hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      <CheckCheck className="size-3" aria-hidden />
                      {t("notifications.ui.markAllRead")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded p-1 text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    aria-label={t("notifications.ui.close")}
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
                      {t("notifications.ui.caughtUp")}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {t("notifications.ui.emptyHint")}
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
                                    aria-label={t("notifications.ui.unreadAria")}
                                  />
                                ) : null}
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                                {item.message}
                              </p>
                              <p className="mt-1 text-[11px] text-ink-muted/70">
                                {timeAgo(item.createdAt, t, locale)}
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
                    {t("notifications.ui.viewAll")}
                  </Link>
                </div>
              ) : null}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={cn(
          "dashboard-icon-btn notification-bell-btn relative inline-flex items-center justify-center rounded-md border border-ink/10 bg-canvas p-2 text-ink-muted transition-colors hover:border-ink/20 hover:text-ink",
          open && "border-accent/30 text-accent-deep",
          attention && !open && "notification-bell-attention",
        )}
        aria-label={
          attention
            ? hasUnread
              ? t("notifications.ui.ariaLabelUnreadNew", { count: unreadCount })
              : t("notifications.ui.ariaLabelNew")
            : hasUnread
              ? t("notifications.ui.ariaLabelUnread", { count: unreadCount })
              : t("notifications.ui.ariaLabel")
        }
        aria-expanded={open}
        aria-haspopup="dialog"
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
