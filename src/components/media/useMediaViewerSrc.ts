"use client";

import { useEffect, useState } from "react";

export type MediaViewerPurpose = "display" | "original";

type DownloadUrlResponse = {
  url: string;
  purpose: string;
  contentType?: string;
};

type CacheEntry = {
  url: string;
  purpose: MediaViewerPurpose;
  fetchedAt: number;
};

/** In-memory signed URL cache so lightbox ↔ slideshow ↔ preload share fetches. */
const viewerUrlCache = new Map<string, CacheEntry>();
/** In-flight fetches so concurrent mounts/preloads share one request. */
const inflight = new Map<string, Promise<string>>();
const CACHE_TTL_MS = 12 * 60 * 1000;

function cacheKey(mediaId: string, purpose: MediaViewerPurpose): string {
  return `${mediaId}:${purpose}`;
}

function readCache(
  mediaId: string,
  purpose: MediaViewerPurpose,
): string | null {
  const entry = viewerUrlCache.get(cacheKey(mediaId, purpose));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    viewerUrlCache.delete(cacheKey(mediaId, purpose));
    return null;
  }
  return entry.url;
}

function writeCache(
  mediaId: string,
  purpose: MediaViewerPurpose,
  url: string,
): void {
  viewerUrlCache.set(cacheKey(mediaId, purpose), {
    url,
    purpose,
    fetchedAt: Date.now(),
  });
}

function viewerPurposeForType(
  type: string,
  purpose?: MediaViewerPurpose,
): MediaViewerPurpose {
  if (purpose) return purpose;
  // Prefer web playback / display derivatives for both photos and videos.
  return "display";
}

/**
 * Fetch a display/original signed URL (never thumbnail).
 * Returns as soon as the URL is signed — does not wait for image bytes.
 */
export async function loadMediaViewerUrl(options: {
  mediaId: string;
  type: "photo" | "video" | string;
  purpose?: MediaViewerPurpose;
  signal?: AbortSignal;
}): Promise<string> {
  const purpose = viewerPurposeForType(options.type, options.purpose);
  const cached = readCache(options.mediaId, purpose);
  if (cached) return cached;

  const key = cacheKey(options.mediaId, purpose);
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(`/api/media/${options.mediaId}/download-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || `Failed to load media (${res.status})`);
      }
      const data = (await res.json()) as DownloadUrlResponse;
      if (!data.url) {
        throw new Error("Download URL missing from response.");
      }
      writeCache(options.mediaId, purpose, data.url);
      return data.url;
    })().finally(() => {
      inflight.delete(key);
    });
    inflight.set(key, pending);
  }

  const url = await pending;
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return url;
}

/** Warm browser decode cache without blocking the viewer. */
function warmImageDecode(url: string): void {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  } catch {
    // ignore
  }
}

/**
 * Warm the next full-res assets (slideshow / adjacent lightbox).
 * Never uses thumbnail keys.
 */
export function preloadMediaViewerUrls(
  items: Array<{ mediaId: string; type: "photo" | "video" | string }>,
): void {
  for (const item of items) {
    if (!item.mediaId) continue;
    const purpose = viewerPurposeForType(item.type);
    if (readCache(item.mediaId, purpose)) {
      const url = readCache(item.mediaId, purpose);
      if (url && item.type !== "video") warmImageDecode(url);
      continue;
    }
    void loadMediaViewerUrl({
      mediaId: item.mediaId,
      type: item.type,
      purpose,
    })
      .then((url) => {
        if (item.type !== "video") warmImageDecode(url);
      })
      .catch(() => {
        // Prefetch is best-effort.
      });
  }
}

/**
 * Full-resolution viewer URL only — never falls back to grid thumbnails.
 * Sets `src` as soon as the signed URL is available (browser loads pixels).
 */
export function useMediaViewerSrc(options: {
  mediaId: string | null | undefined;
  /**
   * @deprecated Ignored. Kept so call sites compile; viewers must not render thumbs.
   */
  previewUrl?: string | null | undefined;
  type: "photo" | "video" | string;
  purpose?: MediaViewerPurpose;
  enabled?: boolean;
}) {
  const {
    mediaId,
    type,
    purpose = viewerPurposeForType(type),
    enabled = true,
  } = options;

  const [hiResUrl, setHiResUrl] = useState<string | null>(() =>
    mediaId && enabled ? readCache(mediaId, purpose) : null,
  );
  const [loading, setLoading] = useState(
    () => Boolean(mediaId && enabled && !readCache(mediaId, purpose)),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !mediaId) {
      setHiResUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = readCache(mediaId, purpose);
    if (cached) {
      setHiResUrl(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = await loadMediaViewerUrl({
          mediaId: mediaId!,
          type,
          purpose,
          signal: controller.signal,
        });
        if (!cancelled) {
          setHiResUrl(url);
          setLoading(false);
        }
      } catch (err) {
        if (
          cancelled ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mediaId, purpose, type, enabled]);

  return {
    src: hiResUrl,
    hiResUrl,
    loading: loading && !hiResUrl,
    ready: Boolean(hiResUrl),
    error,
  };
}
