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
  return `Watch “${movie.title}”`;
}

export function movieShareUrl(movie: SerializedMovie): string | null {
  return movie.downloadUrl || movie.playUrl || null;
}

export type MovieSocialNetwork =
  | "facebook"
  | "x"
  | "pinterest"
  | "instagram"
  | "tiktok";

/**
 * Build a share intent URL where the platform supports link sharing.
 * Instagram and TikTok have no public web share endpoint for videos —
 * callers should download + open the app instead.
 */
export function movieSocialShareUrl(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
): string | null {
  const url = movieShareUrl(movie);
  const text = movieShareText(movie);
  if (!url) return null;

  switch (network) {
    case "facebook":
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
    case "instagram":
    case "tiktok":
      return null;
  }
}

/** Open a social share intent in a sized popup (desktop) or new tab. */
export function openMovieSocialShare(
  network: MovieSocialNetwork,
  movie: SerializedMovie,
): boolean {
  const href = movieSocialShareUrl(network, movie);
  if (!href || typeof window === "undefined") return false;
  const popup = window.open(
    href,
    "fmv-movie-share",
    "noopener,noreferrer,width=640,height=640",
  );
  if (!popup) {
    window.open(href, "_blank", "noopener,noreferrer");
  }
  return true;
}

export async function copyMovieShareLink(
  movie: SerializedMovie,
): Promise<boolean> {
  const url = movieShareUrl(movie);
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
  const url = movieShareUrl(movie);
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

    try {
      await nav.share({
        title: movie.title,
        text: movieShareText(movie),
        url,
      });
      return true;
    } catch {
      // User cancel or unsupported — open download.
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
