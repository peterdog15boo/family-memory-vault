"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  BookHeart,
  CalendarDays,
  Film,
  HardDrive,
  ImageIcon,
  Shield,
  Heart,
  Users,
} from "lucide-react";
import { useCopy, useLocale, useTranslations } from "@/components/i18n/LocaleProvider";
import { openNotificationDestination } from "@/lib/notifications/open";
import { formatDate, type TranslateFn } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

type Props = {
  initialItems: NotificationItem[];
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

export function NotificationsList({ initialItems }: Props) {
  const router = useRouter();
  const copy = useCopy();
  const t = useTranslations();
  const { locale } = useLocale();
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();

  const hasUnread = items.some((n) => !n.readAt);

  async function handleMarkRead(id: string) {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      ),
    );
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    // Keep header badge seed in sync when leaving for Admin and returning.
    startTransition(() => router.refresh());
  }

  async function handleMarkAllRead() {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    startTransition(() => router.refresh());
  }

  function handleClick(item: NotificationItem) {
    if (!item.readAt) void handleMarkRead(item.id);
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

  if (items.length === 0) {
    return (
      <div className="list-panel rounded-2xl border border-ink/10 bg-canvas/80 px-6 py-16 text-center">
        <Bell className="mx-auto size-10 text-ink/15" aria-hidden />
        <p className="mt-3 text-sm font-medium text-ink/60">
          {copy.empty.notifications.title}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {copy.empty.notifications.description}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasUnread ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-accent-deep transition hover:bg-accent/10"
          >
            <CheckCheck className="size-3.5" aria-hidden />
            {t("notifications.ui.markAllAsRead")}
          </button>
        </div>
      ) : null}

      <ul className="list-panel divide-y divide-ink/5 overflow-hidden rounded-2xl border border-ink/10 bg-canvas/80">
        {items.map((item) => {
          const Icon = ICON_MAP[item.type] ?? Bell;
          const isUnread = !item.readAt;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => handleClick(item)}
                className={cn(
                  "flex w-full gap-4 px-5 py-4 text-left transition hover:bg-ink/[0.03]",
                  isUnread && "bg-accent/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
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
                        "text-sm",
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
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                    {item.message}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-muted/70">
                    {timeAgo(item.createdAt, t, locale)}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
