"use client";

/**
 * Shared notification click → mark read + navigate (bell + full inbox).
 */

import {
  dispatchOpenFamilyChat,
  parseFamilyChatOpenFromLink,
} from "@/components/family-chat/FamilyChatContext";
import { announce } from "@/lib/a11y/announce";
import {
  parseMovieIdFromHref,
  resolveNotificationHref,
} from "@/lib/notifications/links";

export type NotificationNavItem = {
  id: string;
  type: string;
  link: string | null;
  readAt: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function markNotificationRead(id: string): Promise<void> {
  await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

/**
 * Open a notification destination. Returns the href navigated to (or null when
 * family chat was opened in-place).
 */
export async function openNotificationDestination(
  item: NotificationNavItem,
  options: {
    push: (href: string) => void;
    missingMovieMessage: string;
  },
): Promise<string | null> {
  if (!item.readAt) {
    void markNotificationRead(item.id);
  }

  const meta = item.metadata ?? {};
  const metaThreadId =
    typeof meta.threadId === "string" ? meta.threadId : null;
  const metaFamilyId =
    typeof meta.familyId === "string" ? meta.familyId : null;
  const href = resolveNotificationHref({
    type: item.type,
    link: item.link,
    metadata: meta,
  });
  const fromLink = parseFamilyChatOpenFromLink(href);
  const threadId =
    item.type === "family_chat"
      ? metaThreadId || fromLink.threadId
      : fromLink.threadId;
  const familyId =
    item.type === "family_chat"
      ? metaFamilyId || fromLink.familyId
      : fromLink.familyId;

  if (threadId) {
    dispatchOpenFamilyChat(threadId, familyId);
    return null;
  }

  if (item.type === "movie_ready") {
    const movieId =
      (typeof meta.movieId === "string" && meta.movieId.trim()) ||
      parseMovieIdFromHref(href);
    if (movieId) {
      try {
        const res = await fetch(`/api/movies/${encodeURIComponent(movieId)}`);
        if (!res.ok) {
          announce(options.missingMovieMessage, { priority: "polite" });
          options.push("/movies");
          return "/movies";
        }
      } catch {
        // Network blip — still try the deep link; Movies page handles missing.
      }
    }
  }

  options.push(href);
  return href;
}
