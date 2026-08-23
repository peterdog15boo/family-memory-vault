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
 * Durable public share page only — required for Facebook / X / Pinterest.
 * Never returns signed CDN MP4 URLs.
 */
export function moviePublicShareUrl(movie: SerializedMovie): string | null {
  const url = movie.shareUrl?.trim();
  return url || null;
}

/** Extract share token from /share/movies/{token} or legacy /share/m/{token}. */
export function movieShareTokenFromUrl(shareUrl: string | null | undefined): string | null {
  if (!shareUrl?.trim()) return null;
  try {
    const path = new URL(shareUrl, "https://example.invalid").pathname;
    const match = /\/share\/(?:movies|m)\/([^/]+)\/?$/.exec(path);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export type MovieSocialNetwork =
  | "facebook"
  | "x"
  | "pinterest"
  | "instagram"
  | "tiktok";

export function movieSocialUsesPublicLink(
  network: MovieSocialNetwork,
): boolean {
  return network === "facebook" || network === "x" || network === "pinterest";
}

export function movieSocialNetworkLabel(network: MovieSocialNetwork): string {
  switch (network) {
    case "facebook":
      return "Facebook";
    case "x":
      return "X";
    case "pinterest":
      return "Pinterest";
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
  }
}

export type SocialIntentInput = {
  /** Absolute public share page URL (never a signed R2 MP4). */
  sharePageUrl: string;
  text: string;
  /** Absolute poster URL for Pinterest (and OG). */
  posterUrl?: string | null;
};

/**
 * Build platform intent URLs that share the public movie page.
 */
export function buildSocialIntentUrl(
  network: Exclude<MovieSocialNetwork, "instagram" | "tiktok">,
  input: SocialIntentInput,
): string {
  const page = input.sharePageUrl.trim();
  const text = input.text.trim();

  switch (network) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(page)}`;
    case "x":
      return `https://twitter.com/intent/tweet?url=${encodeURIComponent(page)}&text=${encodeURIComponent(text)}`;
    case "pinterest": {
      const params = new URLSearchParams({
        url: page,
        description: text,
      });
      if (input.posterUrl?.trim()) {
        params.set("media", input.posterUrl.trim());
      }
      return `https://www.pinterest.com/pin/create/button/?${params.toString()}`;
    }
  }
}

/** @deprecated Prefer buildSocialIntentUrl with an explicit share page URL. */
export function movieSocialShareUrl(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
  posterUrl?: string | null,
): string | null {
  if (network === "instagram" || network === "tiktok") return null;
  const page = moviePublicShareUrl(movie);
  if (!page) return null;
  return buildSocialIntentUrl(network, {
    sharePageUrl: page,
    text: movieShareText(movie),
    posterUrl:
      posterUrl ??
      (movieShareTokenFromUrl(page)
        ? undefined
        : movie.thumbnailUrl),
  });
}

const SHARE_LOG = "[movie.share]";

export function logMovieShare(
  message: string,
  details?: Record<string, unknown>,
): void {
  if (details) console.info(SHARE_LOG, message, details);
  else console.info(SHARE_LOG, message);
}

/**
 * Open a placeholder tab under the user gesture.
 * Writes a tiny loading doc so the tab is not an empty about:blank flash.
 */
export function openShareIntentPlaceholder(): Window | null {
  if (typeof window === "undefined") return null;
  try {
    const win = window.open("about:blank", "_blank");
    if (!win) {
      logMovieShare("placeholder:blocked");
      return null;
    }
    try {
      win.document.open();
      win.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>Opening share…</title></head><body style="margin:0;font:15px/1.4 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;background:#111;color:#eee">Opening share…</body></html>`,
      );
      win.document.close();
    } catch {
      // Some browsers restrict document write on the new tab — still usable.
    }
    logMovieShare("placeholder:opened");
    return win;
  } catch (err) {
    console.error(SHARE_LOG, "placeholder open failed", err);
    return null;
  }
}

/**
 * Point a gesture-captured tab at the social intent URL.
 * Never closes the tab on success (closing caused flash-and-return).
 */
export function navigateShareIntent(
  href: string,
  placeholder: Window | null,
): { opened: boolean; blocked: boolean } {
  if (!href || typeof window === "undefined") {
    return { opened: false, blocked: true };
  }

  if (placeholder && !placeholder.closed) {
    try {
      placeholder.location.replace(href);
      try {
        placeholder.focus();
      } catch {
        // ignore
      }
      logMovieShare("intent:navigated", { href });
      return { opened: true, blocked: false };
    } catch (err) {
      console.error(SHARE_LOG, "intent navigate failed", err);
    }
  }

  try {
    const win = window.open(href, "_blank");
    if (win) {
      logMovieShare("intent:windowOpen", { href });
      return { opened: true, blocked: false };
    }
  } catch (err) {
    console.error(SHARE_LOG, "intent window.open failed", err);
  }

  logMovieShare("intent:blocked", { href });
  return { opened: false, blocked: true };
}

export async function copyMovieShareLink(
  movie: SerializedMovie,
): Promise<boolean> {
  const url = moviePublicShareUrl(movie) || movieShareUrl(movie);
  if (!url || typeof navigator === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    // fall through
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

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof navigator === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const input = document.createElement("textarea");
    input.value = text;
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
 * Full social share open flow for Facebook / X / Pinterest.
 * Call openShareIntentPlaceholder() synchronously on click first, then this.
 */
export async function completeSocialShareIntent(input: {
  network: Exclude<MovieSocialNetwork, "instagram" | "tiktok">;
  placeholder: Window | null;
  ensureSharePage: () => Promise<{
    sharePageUrl: string;
    posterUrl: string | null;
    text: string;
  }>;
}): Promise<{
  opened: boolean;
  copied: boolean;
  sharePageUrl: string | null;
  error?: string;
}> {
  const { network, placeholder } = input;
  try {
    const ready = await input.ensureSharePage();
    const href = buildSocialIntentUrl(network, {
      sharePageUrl: ready.sharePageUrl,
      text: ready.text,
      posterUrl: ready.posterUrl,
    });
    const nav = navigateShareIntent(href, placeholder);
    if (nav.opened) {
      return {
        opened: true,
        copied: false,
        sharePageUrl: ready.sharePageUrl,
      };
    }
    // Popup blocked — do NOT close a successful tab; placeholder may be null.
    if (placeholder && !placeholder.closed) {
      try {
        placeholder.close();
      } catch {
        // ignore
      }
    }
    const copied = await copyTextToClipboard(ready.sharePageUrl);
    return {
      opened: false,
      copied,
      sharePageUrl: ready.sharePageUrl,
      error: copied ? undefined : "copy_failed",
    };
  } catch (err) {
    console.error(SHARE_LOG, "completeSocialShareIntent failed", network, err);
    if (placeholder && !placeholder.closed) {
      try {
        placeholder.close();
      } catch {
        // ignore
      }
    }
    return {
      opened: false,
      copied: false,
      sharePageUrl: null,
      error: err instanceof Error ? err.message : "share_failed",
    };
  }
}

/** Legacy aliases used by older tests/callers. */
export function openBlankShareTab(): Window | null {
  return openShareIntentPlaceholder();
}

export function navigateShareTab(
  href: string,
  targetWindow?: Window | null,
): { opened: boolean; blocked: boolean } {
  return navigateShareIntent(href, targetWindow ?? null);
}

export function tryOpenExternalUrl(
  href: string,
  targetWindow?: Window | null,
): { opened: boolean; blocked: boolean } {
  return navigateShareIntent(href, targetWindow ?? null);
}

export function openMovieSocialShare(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
  options?: { targetWindow?: Window | null },
): boolean {
  const href = movieSocialShareUrl(network, movie);
  if (!href) return false;
  return navigateShareIntent(href, options?.targetWindow ?? null).opened;
}

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
      // fall through
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
        // cancel
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
