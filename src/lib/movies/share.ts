/**
 * Client-safe helpers for movie download / share presentation.
 */

import type { SerializedMovie } from "@/lib/movies/serialize";
import type { MovieAspectRatio } from "@/lib/movies/settings";
import { normalizeMovieSettings } from "@/lib/movies/settings";

export function movieAspectFromSettings(
  settings: SerializedMovie["settings"] | null | undefined,
): MovieAspectRatio {
  return normalizeMovieSettings(settings ?? {}).aspectRatio;
}

/** Tailwind aspect utility for posters / players. */
export function movieAspectClass(aspect: MovieAspectRatio): string {
  switch (aspect) {
    case "9:16":
      return "aspect-[9/16]";
    case "1:1":
      return "aspect-square";
    case "16:9":
    default:
      return "aspect-video";
  }
}

export function movieDownloadFilename(title: string | null | undefined): string {
  const base =
    (title || "movie").replace(/[^\w\s-]+/g, "").trim() || "movie";
  return `${base}.mp4`;
}

export function movieShareText(movie: SerializedMovie): string {
  return `Watch “${movie.title}” — made with Family Memory Vault`;
}

/**
 * Best available URL for copy / system share.
 * Prefer the durable public page; fall back to signed media only as a last resort.
 */
export function movieShareUrl(movie: SerializedMovie): string | null {
  return movie.shareUrl || movie.downloadUrl || movie.playUrl || null;
}

/**
 * Durable public share page only — required for Facebook / X / Pinterest intents.
 * Never returns signed CDN MP4 URLs (crawlers reject those and Facebook lands on home).
 */
export function moviePublicShareUrl(movie: SerializedMovie): string | null {
  const url = movie.shareUrl?.trim();
  return url || null;
}

export type MovieSocialNetwork =
  | "facebook"
  | "x"
  | "pinterest"
  | "instagram"
  | "tiktok";

/** Networks that compose a post from a public link (not file upload). */
export function movieSocialUsesPublicLink(
  network: MovieSocialNetwork,
): boolean {
  return network === "facebook" || network === "x" || network === "pinterest";
}

/**
 * Build a share intent URL where the platform supports link sharing.
 * Instagram and TikTok have no public web share endpoint for videos —
 * callers should download + open the app instead.
 *
 * Facebook / X / Pinterest require a durable public share page URL.
 */
export function movieSocialShareUrl(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
): string | null {
  if (network === "instagram" || network === "tiktok") {
    return null;
  }

  const url = moviePublicShareUrl(movie);
  if (!url) return null;
  const text = movieShareText(movie);

  switch (network) {
    case "facebook":
      // Official web share dialog — populates the composer with `u`.
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    case "pinterest": {
      const params = new URLSearchParams({
        url,
        description: text,
      });
      if (movie.thumbnailUrl) params.set("media", movie.thumbnailUrl);
      return `https://www.pinterest.com/pin/create/button/?${params.toString()}`;
    }
  }
}

/**
 * Open a social share intent in a new tab/window.
 * Pass an already-ensured movie with `shareUrl` set for link networks.
 */
export function openMovieSocialShare(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
  options?: { targetWindow?: Window | null },
): boolean {
  const href = movieSocialShareUrl(network, movie);
  if (!href || typeof window === "undefined") return false;

  const existing = options?.targetWindow;
  if (existing && !existing.closed) {
    try {
      existing.location.href = href;
      existing.focus();
      return true;
    } catch {
      // Cross-origin / closed — fall through to a fresh open.
    }
  }

  const popup = window.open(href, "_blank", "width=720,height=720");
  if (!popup) {
    // Popup blocked — open via an anchor so the app page stays put.
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  return true;
}

/**
 * Ensure a durable public share link exists, then open the network composer.
 * Opens a blank window synchronously when the share URL still needs creating,
 * so popup blockers do not swallow the Facebook dialog after an await.
 */
export async function openMovieSocialShareEnsured(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
  ensureShareUrl: () => Promise<SerializedMovie>,
): Promise<{ ok: boolean; movie: SerializedMovie }> {
  if (network === "instagram" || network === "tiktok") {
    return { ok: false, movie };
  }

  let target: Window | null = null;
  // Do not use noopener on the placeholder — we need the Window to set location.
  if (typeof window !== "undefined" && !moviePublicShareUrl(movie)) {
    target = window.open("about:blank", "_blank", "width=720,height=720");
  }

  try {
    const ready = moviePublicShareUrl(movie)
      ? movie
      : await ensureShareUrl();
    if (!moviePublicShareUrl(ready)) {
      if (target && !target.closed) target.close();
      return { ok: false, movie: ready };
    }
    const ok = openMovieSocialShare(network, ready, { targetWindow: target });
    if (!ok && target && !target.closed) {
      target.close();
    }
    return { ok, movie: ready };
  } catch {
    if (target && !target.closed) target.close();
    return { ok: false, movie };
  }
}

export async function copyMovieShareLink(
  movie: SerializedMovie,
): Promise<boolean> {
  const url = moviePublicShareUrl(movie) || movieShareUrl(movie);
  if (!url || typeof navigator === "undefined" || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort Web Share API with file attachment; falls back to opening the
 * download URL. Safe to call from the browser only.
 */
export async function shareMovieFile(movie: SerializedMovie): Promise<boolean> {
  const url = movie.downloadUrl || movie.playUrl || movieShareUrl(movie);
  if (!url || typeof window === "undefined") return false;

  const filename = movieDownloadFilename(movie.title);
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.share === "function") {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], filename, {
          type: blob.type || "video/mp4",
        });
        const fileData: ShareData = {
          files: [file],
          title: movie.title,
          text: movieShareText(movie),
        };
        if (!nav.canShare || nav.canShare(fileData)) {
          await nav.share(fileData);
          return true;
        }
      }
    } catch {
      // Fall through to URL share / download.
    }

    const pageUrl = moviePublicShareUrl(movie);
    if (pageUrl) {
      try {
        await nav.share({
          title: movie.title,
          text: movieShareText(movie),
          url: pageUrl,
        });
        return true;
      } catch {
        // User cancel or unsupported — open download.
      }
    }
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

/** Trigger a direct file download in the browser. */
export function downloadMovieFile(movie: SerializedMovie): boolean {
  const url = movie.downloadUrl || movie.playUrl;
  if (!url || typeof document === "undefined") return false;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = movieDownloadFilename(movie.title);
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}
