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

export type TryOpenExternalUrlResult = {
  opened: boolean;
  /** True when the browser blocked the new tab/window. */
  blocked: boolean;
};

const SHARE_LOG = "[movie.share]";

export function logMovieShare(
  message: string,
  details?: Record<string, unknown>,
): void {
  if (details) {
    console.info(SHARE_LOG, message, details);
  } else {
    console.info(SHARE_LOG, message);
  }
}

/**
 * Open a blank tab under the current user gesture.
 * Must be called synchronously from a click handler (before await/setState).
 */
export function openBlankShareTab(): Window | null {
  if (typeof window === "undefined") return null;
  try {
    const win = window.open("about:blank", "_blank");
    logMovieShare("openBlankShareTab", {
      opened: Boolean(win),
      closed: win?.closed ?? null,
    });
    return win;
  } catch (err) {
    console.error(SHARE_LOG, "openBlankShareTab failed", err);
    return null;
  }
}

/**
 * Navigate a previously opened tab (or open a fresh tab) to href.
 * Prefer navigating a gesture-captured blank tab — that survives async work.
 */
export function navigateShareTab(
  href: string,
  targetWindow?: Window | null,
): TryOpenExternalUrlResult {
  if (!href || typeof window === "undefined") {
    return { opened: false, blocked: true };
  }

  if (targetWindow && !targetWindow.closed) {
    try {
      const loc = targetWindow.location as Location & {
        assign?: (url: string) => void;
      };
      if (typeof loc.assign === "function") {
        loc.assign(href);
      } else {
        loc.href = href;
      }
      targetWindow.focus();
      logMovieShare("navigateShareTab via placeholder", { href });
      return { opened: true, blocked: false };
    } catch (err) {
      console.error(SHARE_LOG, "navigateShareTab placeholder failed", err);
    }
  }

  // Plain _blank tab (no size features) — less likely treated as a blocked popup.
  try {
    const win = window.open(href, "_blank");
    if (win) {
      try {
        win.opener = null;
      } catch {
        // ignore
      }
      logMovieShare("navigateShareTab via window.open", { href });
      return { opened: true, blocked: false };
    }
  } catch (err) {
    console.error(SHARE_LOG, "window.open failed", err);
  }

  logMovieShare("navigateShareTab blocked", { href });
  return { opened: false, blocked: true };
}

/**
 * @deprecated Prefer navigateShareTab / openBlankShareTab.
 */
export function tryOpenExternalUrl(
  href: string,
  targetWindow?: Window | null,
): TryOpenExternalUrlResult {
  return navigateShareTab(href, targetWindow);
}

/**
 * @deprecated Prefer navigateShareTab.
 */
export function openMovieSocialShare(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
  options?: { targetWindow?: Window | null },
): boolean {
  const href = movieSocialShareUrl(network, movie);
  if (!href) return false;
  return navigateShareTab(href, options?.targetWindow).opened;
}

export type SocialShareEnsuredResult = {
  ok: boolean;
  opened: boolean;
  blocked: boolean;
  copied: boolean;
  movie: SerializedMovie;
  shareUrl: string | null;
  error?: "no_share_url" | "copy_failed";
};

/**
 * Ensure a durable public share link exists, then open the network composer.
 * Caller should pass a blank Window opened synchronously on click when possible.
 */
export async function openMovieSocialShareEnsured(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
  ensureShareUrl: () => Promise<SerializedMovie>,
  preOpenedTab?: Window | null,
): Promise<SocialShareEnsuredResult> {
  if (network === "instagram" || network === "tiktok") {
    return {
      ok: false,
      opened: false,
      blocked: false,
      copied: false,
      movie,
      shareUrl: null,
      error: "no_share_url",
    };
  }

  let placeholder = preOpenedTab ?? null;
  const alreadyPublic = Boolean(moviePublicShareUrl(movie));
  if (typeof window !== "undefined" && !placeholder) {
    placeholder = openBlankShareTab();
  }

  let ready = movie;
  try {
    if (!alreadyPublic) {
      ready = await ensureShareUrl();
    }
  } catch (err) {
    console.error(SHARE_LOG, "ensureShareUrl failed", err);
    if (placeholder && !placeholder.closed) placeholder.close();
    return {
      ok: false,
      opened: false,
      blocked: false,
      copied: false,
      movie,
      shareUrl: null,
      error: "no_share_url",
    };
  }

  const shareUrl = moviePublicShareUrl(ready);
  const href = shareUrl ? movieSocialShareUrl(network, ready) : null;
  if (!shareUrl || !href) {
    if (placeholder && !placeholder.closed) placeholder.close();
    return {
      ok: false,
      opened: false,
      blocked: false,
      copied: false,
      movie: ready,
      shareUrl: null,
      error: "no_share_url",
    };
  }

  const { opened, blocked } = navigateShareTab(href, placeholder);
  if (opened) {
    return {
      ok: true,
      opened: true,
      blocked: false,
      copied: false,
      movie: ready,
      shareUrl,
    };
  }

  if (placeholder && !placeholder.closed) {
    try {
      placeholder.close();
    } catch {
      // ignore
    }
  }

  const copied = await copyMovieShareLink(ready);
  return {
    ok: copied,
    opened: false,
    blocked,
    copied,
    movie: ready,
    shareUrl,
    error: copied ? undefined : "copy_failed",
  };
}

export async function copyMovieShareLink(
  movie: SerializedMovie,
): Promise<boolean> {
  const url = moviePublicShareUrl(movie) || movieShareUrl(movie);
  if (!url || typeof navigator === "undefined") {
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback.
  }
  try {
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    return ok;
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
