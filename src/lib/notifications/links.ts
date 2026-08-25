/**
 * Resolve in-app deep links for notifications by type + metadata.
 * Prefer entity ids in metadata over a stored `link` when the link is generic
 * or historically wrong (e.g. movie_ready → /memories/…).
 */

import {
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@/lib/db/schema";

const NOTIFICATION_TYPE_SET = new Set<string>(NOTIFICATION_TYPES);

export function isNotificationType(value: string): value is NotificationType {
  return NOTIFICATION_TYPE_SET.has(value);
}

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const raw = metadata?.[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Accept only same-origin app paths (ignore absolute / protocol-relative). */
export function sanitizeInternalPath(link: string | null | undefined): string | null {
  if (!link?.trim()) return null;
  const raw = link.trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      return `${url.pathname}${url.search}${url.hash}` || "/dashboard";
    } catch {
      return null;
    }
  }
  if (raw.startsWith("//")) return null;
  if (!raw.startsWith("/") && !raw.startsWith("#")) return null;
  return raw;
}

export type ResolveNotificationHrefInput = {
  type: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Canonical destination for a notification click.
 * Falls back to `/dashboard` when nothing useful is known.
 */
export function resolveNotificationHref(
  input: ResolveNotificationHrefInput,
): string {
  const stored = sanitizeInternalPath(input.link);
  const meta = input.metadata ?? {};
  const type = isNotificationType(input.type) ? input.type : null;

  if (!type) {
    return stored ?? "/dashboard";
  }

  switch (type) {
    case "movie_ready": {
      const movieId = metaString(meta, "movieId");
      const firstFamily =
        meta.firstFamilyMovie === true ||
        metaString(meta, "firstFamilyMovie") === "1";
      if (movieId && firstFamily) {
        return `/first-family-movie?movieId=${encodeURIComponent(movieId)}`;
      }
      if (movieId) {
        return `/movies?movieId=${encodeURIComponent(movieId)}`;
      }
      return "/movies";
    }
    case "memory_created": {
      const memoryId = metaString(meta, "memoryId");
      if (memoryId) return `/memories/${encodeURIComponent(memoryId)}`;
      return stored && stored.startsWith("/memories/") ? stored : "/memories";
    }
    case "media_ready": {
      const mediaId = metaString(meta, "mediaId");
      if (mediaId) {
        return `/media?mediaId=${encodeURIComponent(mediaId)}`;
      }
      return stored ?? "/media";
    }
    case "moderation_attention": {
      const mediaId = metaString(meta, "mediaId");
      if (mediaId) {
        return `/media?mediaId=${encodeURIComponent(mediaId)}`;
      }
      return stored ?? "/media";
    }
    case "family_invite":
    case "family_milestone":
      return stored ?? "/family";
    case "family_chat": {
      const threadId = metaString(meta, "threadId");
      const familyId = metaString(meta, "familyId");
      if (threadId && familyId) {
        return `/#family-chat=${encodeURIComponent(threadId)}&family=${encodeURIComponent(familyId)}`;
      }
      if (threadId) {
        return `/#family-chat=${encodeURIComponent(threadId)}`;
      }
      return stored ?? "/family";
    }
    case "photo_request":
      return stored ?? "/upload";
    case "storage_warning":
      return stored ?? "/billing";
    case "legacy_milestone":
      return stored ?? "/legacy";
    case "emergency_access": {
      const action = metaString(meta, "action");
      if (action === "granted" || action === "denied") {
        return stored ?? "/emergency-access";
      }
      return stored ?? "/documents/legacy/emergency";
    }
    case "weekly_digest":
      return stored ?? "/on-this-day";
    default:
      return stored ?? "/dashboard";
  }
}

/** Parse `movieId` from a movies deep link. */
export function parseMovieIdFromHref(href: string | null | undefined): string | null {
  if (!href?.trim()) return null;
  try {
    const url = new URL(href, "https://family-memory-vault.local");
    const id = url.searchParams.get("movieId")?.trim();
    return id || null;
  } catch {
    return null;
  }
}
