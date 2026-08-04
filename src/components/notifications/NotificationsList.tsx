"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Film,
  HardDrive,
  ImageIcon,
  Shield,
  Users,
} from "lucide-react";
import { COPY } from "@/lib/copy";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type Props = {
  initialItems: NotificationItem[];
};

const ICON_MAP: Record<string, typeof Bell> = {
  media_ready: ImageIcon,
  movie_ready: Film,
  family_invite: Users,
  storage_warning: HardDrive,
  moderation_attention: Shield,
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

export function NotificationsList({ initialItems }: Props) {
  const router = useRouter();
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
  }

  function handleClick(item: NotificationItem) {
    if (!item.readAt) void handleMarkRead(item.id);
    if (!item.link) return;
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

  if (items.length === 0) {
    return (
      <div className="list-panel rounded-2xl border border-ink/10 bg-canvas/80 px-6 py-16 text-center">
        <Bell className="mx-auto size-10 text-ink/15" aria-hidden />
        <p className="mt-3 text-sm font-medium text-ink/60">
          {COPY.empty.notifications.title}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {COPY.empty.notifications.description}
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
            Mark all as read
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
                        aria-label="Unread"
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">
                    {item.message}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-muted/70">
                    {timeAgo(item.createdAt)}
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
