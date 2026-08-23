/**
 * Client-safe helpers for movie download / share presentation.
 * Reliability-first: Copy Link is the core path; social intents are best-effort.
 */

import type { SerializedMovie } from "@/lib/movies/serialize";
import type { MovieAspectRatio } from "@/lib/movies/settings";
import { normalizeMovieSettings } from "@/lib/movies/settings";

export function movieAspectFromSettings(
  settings: SerializedMovie["settings"] | null | undefined,
): MovieAspectRatio {
  return normalizeMovieSettings(settings ?? {}).aspectRatio;
}

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

export function movieShareUrl(movie: SerializedMovie): string | null {
  return movie.shareUrl || movie.downloadUrl || movie.playUrl || null;
}

export function moviePublicShareUrl(movie: SerializedMovie): string | null {
  const url = movie.shareUrl?.trim();
  return url || null;
}

/** Prefer the browser origin so the link matches the session the user is on. */
export function normalizePublicSharePageUrl(shareUrl: string): string {
  try {
    const parsed = new URL(shareUrl);
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}`;
    }
    return parsed.toString();
  } catch {
    return shareUrl;
  }
}

export function movieShareTokenFromUrl(
  shareUrl: string | null | undefined,
): string | null {
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
  sharePageUrl: string;
  text: string;
  posterUrl?: string | null;
};

export function buildSocialIntentUrl(
  network: Exclude<MovieSocialNetwork, "instagram" | "tiktok">,
  input: SocialIntentInput,
): string {
  const page = normalizePublicSharePageUrl(input.sharePageUrl.trim());
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
        params.set("media", normalizePublicSharePageUrl(input.posterUrl.trim()));
      }
      return `https://www.pinterest.com/pin/create/button/?${params.toString()}`;
    }
  }
}

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
    posterUrl: posterUrl ?? movie.thumbnailUrl,
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

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof navigator === "undefined") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn(SHARE_LOG, "clipboard.writeText failed", err);
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
  } catch (err) {
    console.error(SHARE_LOG, "clipboard fallback failed", err);
    return false;
  }
}

export async function copyMovieShareLink(
  movie: SerializedMovie,
): Promise<boolean> {
  const raw = moviePublicShareUrl(movie) || movieShareUrl(movie);
  if (!raw) return false;
  return copyTextToClipboard(normalizePublicSharePageUrl(raw));
}

export type OpenSocialIntentResult = {
  opened: boolean;
  blocked: boolean;
  intentUrl: string;
  sharePageUrl: string;
  windowOpenReturnedNull: boolean;
};

/**
 * Reliability-first social open:
 * 1) window.open(intentUrl) directly under the click (no about:blank hop)
 * 2) Caller copies + toasts when opened is false
 *
 * about:blank → navigate was flashing and dying under popup heuristics.
 */
export function openSocialIntentWindow(intentUrl: string): {
  opened: boolean;
  blocked: boolean;
  windowOpenReturnedNull: boolean;
} {
  if (!intentUrl || typeof window === "undefined") {
    return { opened: false, blocked: true, windowOpenReturnedNull: true };
  }

  let win: Window | null = null;
  let thrown: unknown = null;
  try {
    // No noopener feature flag — that forces a null return and hides success.
    win = window.open(intentUrl, "_blank");
  } catch (err) {
    thrown = err;
    console.error(SHARE_LOG, "window.open threw", err);
  }

  const returnedNull = win == null;
  const closedImmediately = Boolean(win && win.closed);
  const opened = Boolean(win && !win.closed);

  logMovieShare("openSocialIntentWindow", {
    intentUrl,
    returnedNull,
    closedImmediately,
    opened,
    thrown: thrown instanceof Error ? thrown.message : thrown,
  });

  if (opened) {
    try {
      win!.opener = null;
    } catch {
      // ignore
    }
    try {
      win!.focus();
    } catch {
      // ignore
    }
    return { opened: true, blocked: false, windowOpenReturnedNull: false };
  }

  return {
    opened: false,
    blocked: true,
    windowOpenReturnedNull: returnedNull || closedImmediately,
  };
}

/**
 * Full click handler helper for Facebook / X / Pinterest.
 * Must be invoked directly from a click handler (gesture).
 */
export async function shareToSocialNetwork(input: {
  network: Exclude<MovieSocialNetwork, "instagram" | "tiktok">;
  sharePageUrl: string;
  text: string;
  posterUrl?: string | null;
}): Promise<OpenSocialIntentResult & { copied: boolean }> {
  const sharePageUrl = normalizePublicSharePageUrl(input.sharePageUrl);
  const intentUrl = buildSocialIntentUrl(input.network, {
    sharePageUrl,
    text: input.text,
    posterUrl: input.posterUrl,
  });

  logMovieShare("shareToSocialNetwork:start", {
    network: input.network,
    sharePageUrl,
    intentUrl,
  });

  const open = openSocialIntentWindow(intentUrl);
  if (open.opened) {
    return {
      ...open,
      intentUrl,
      sharePageUrl,
      copied: false,
    };
  }

  const copied = await copyTextToClipboard(sharePageUrl);
  logMovieShare("shareToSocialNetwork:fallbackCopy", {
    network: input.network,
    copied,
  });
  return {
    ...open,
    intentUrl,
    sharePageUrl,
    copied,
  };
}

export async function shareMovieFile(movie: SerializedMovie): Promise<boolean> {
  const url = movie.downloadUrl || movie.playUrl || movieShareUrl(movie);
  if (!url || typeof window === "undefined") return false;

  const filename = movieDownloadFilename(movie.title);
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (typeof nav.share === "function") {
    const pageUrl = moviePublicShareUrl(movie);
    if (pageUrl) {
      try {
        await nav.share({
          title: movie.title,
          text: movieShareText(movie),
          url: normalizePublicSharePageUrl(pageUrl),
        });
        return true;
      } catch {
        // cancel / unsupported
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

// --- Legacy aliases (tests / older call sites) ---

export function openShareIntentPlaceholder(): Window | null {
  if (typeof window === "undefined") return null;
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

export function navigateShareIntent(
  href: string,
  placeholder: Window | null,
): { opened: boolean; blocked: boolean } {
  if (placeholder && !placeholder.closed) {
    try {
      placeholder.location.href = href;
      return { opened: true, blocked: false };
    } catch {
      // fall through
    }
  }
  const r = openSocialIntentWindow(href);
  return { opened: r.opened, blocked: r.blocked };
}

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
): boolean {
  const href = movieSocialShareUrl(network, movie);
  if (!href) return false;
  return openSocialIntentWindow(href).opened;
}

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
  try {
    const ready = await input.ensureSharePage();
    if (input.placeholder && !input.placeholder.closed) {
      const href = buildSocialIntentUrl(input.network, ready);
      try {
        input.placeholder.location.href = href;
        return {
          opened: true,
          copied: false,
          sharePageUrl: ready.sharePageUrl,
        };
      } catch {
        try {
          input.placeholder.close();
        } catch {
          // ignore
        }
      }
    }
    const result = await shareToSocialNetwork({
      network: input.network,
      ...ready,
    });
    return {
      opened: result.opened,
      copied: result.copied,
      sharePageUrl: result.sharePageUrl,
    };
  } catch (err) {
    console.error(SHARE_LOG, "completeSocialShareIntent failed", err);
    if (input.placeholder && !input.placeholder.closed) {
      try {
        input.placeholder.close();
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
