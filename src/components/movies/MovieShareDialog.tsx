"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Share2,
  X,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { SerializedMovie } from "@/lib/movies/serialize";
import {
  copyMovieShareLink,
  downloadMovieFile,
  logMovieShare,
  moviePublicShareUrl,
  movieShareUrl,
  movieSocialShareUrl,
  navigateShareTab,
  openBlankShareTab,
  shareMovieFile,
  type MovieSocialNetwork,
} from "@/lib/movies/share";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { cn } from "@/lib/utils";

type MovieShareDialogProps = {
  movie: SerializedMovie;
  onClose: () => void;
};

type SocialOption = {
  id: MovieSocialNetwork;
  labelKey: string;
  hintKey: string;
  mark: string;
  tone: string;
};

const SOCIAL_OPTIONS: SocialOption[] = [
  {
    id: "facebook",
    labelKey: "movie.socialFacebook",
    hintKey: "movie.socialFacebookHint",
    mark: "f",
    tone: "bg-[#1877F2] text-white",
  },
  {
    id: "instagram",
    labelKey: "movie.socialInstagram",
    hintKey: "movie.socialInstagramHint",
    mark: "Ig",
    tone: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white",
  },
  {
    id: "tiktok",
    labelKey: "movie.socialTiktok",
    hintKey: "movie.socialTiktokHint",
    mark: "Tk",
    tone: "bg-ink text-white",
  },
  {
    id: "pinterest",
    labelKey: "movie.socialPinterest",
    hintKey: "movie.socialPinterestHint",
    mark: "P",
    tone: "bg-[#E60023] text-white",
  },
  {
    id: "x",
    labelKey: "movie.socialX",
    hintKey: "movie.socialXHint",
    mark: "𝕏",
    tone: "bg-ink text-white",
  },
];

/**
 * In-app movie share sheet — durable app share page + download MP4.
 */
export function MovieShareDialog({ movie, onClose }: MovieShareDialogProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [shareMovie, setShareMovie] = useState(movie);
  // Only block the first paint while creating a share link — never remount later.
  const [bootstrapping, setBootstrapping] = useState(!movie.shareUrl);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shareMovieRef = useRef(shareMovie);
  shareMovieRef.current = shareMovie;
  const ensuredForIdRef = useRef<string | null>(null);

  const anyUrl = useMemo(() => movieShareUrl(shareMovie), [shareMovie]);
  const publicUrl = useMemo(
    () => moviePublicShareUrl(shareMovie),
    [shareMovie],
  );
  const facebookHref = useMemo(
    () => (publicUrl ? movieSocialShareUrl("facebook", shareMovie) : null),
    [publicUrl, shareMovie],
  );
  const canSystemShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useOverlayA11y({
    open: true,
    onClose,
    containerRef: dialogRef,
    // Keep focus stable while sharing — avoid stealing focus mid-click.
    initialFocus: "container",
  });

  // Ensure a durable public share URL once per movie id.
  // Do NOT depend on the whole `movie` object — parent re-renders were flipping
  // resolving→true and remounting the dialog (flash + cancelled share opens).
  useEffect(() => {
    let cancelled = false;
    const movieId = movie.id;

    async function ensureShare() {
      if (movie.shareUrl) {
        ensuredForIdRef.current = movieId;
        setShareMovie((prev) =>
          prev.id === movieId && prev.shareUrl === movie.shareUrl
            ? prev
            : { ...movie, shareUrl: movie.shareUrl },
        );
        setBootstrapping(false);
        return;
      }

      if (ensuredForIdRef.current === movieId && shareMovieRef.current.shareUrl) {
        setBootstrapping(false);
        return;
      }

      setBootstrapping(true);
      logMovieShare("ensureShare:start", { movieId });
      try {
        const res = await fetch(`/api/movies/${movieId}/share`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as {
          shareUrl?: string;
          error?: string;
        };
        if (cancelled) return;
        if (res.ok && data.shareUrl) {
          ensuredForIdRef.current = movieId;
          setShareMovie((prev) => ({
            ...prev,
            ...movie,
            shareUrl: data.shareUrl,
          }));
          logMovieShare("ensureShare:ok", { movieId, shareUrl: data.shareUrl });
        } else {
          setShareMovie((prev) =>
            prev.id === movieId ? { ...prev, ...movie } : movie,
          );
          setNote(data.error || t("movie.noteShareLinkFailed"));
          console.error("[movie.share] ensureShare failed", {
            movieId,
            status: res.status,
            error: data.error,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[movie.share] ensureShare exception", err);
          setNote(t("movie.noteShareLinkFailed"));
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    void ensureShare();
    return () => {
      cancelled = true;
    };
    // movie.id + whether prop already has shareUrl — not the whole movie object.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional stability
  }, [movie.id, movie.shareUrl, t]);

  async function ensurePublicShareMovie(): Promise<SerializedMovie> {
    const current = shareMovieRef.current;
    if (moviePublicShareUrl(current)) return current;
    const res = await fetch(`/api/movies/${movie.id}/share`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as {
      shareUrl?: string;
      error?: string;
    };
    if (!res.ok || !data.shareUrl) {
      throw new Error(data.error || t("movie.noteShareLinkFailed"));
    }
    const next = { ...current, shareUrl: data.shareUrl };
    shareMovieRef.current = next;
    setShareMovie(next);
    return next;
  }

  async function fallbackCopyForNetwork(network: MovieSocialNetwork) {
    const ready = shareMovieRef.current;
    const copiedOk = await copyMovieShareLink(ready);
    logMovieShare("copyFallback", { network, copiedOk });
    if (copiedOk) {
      setCopied(true);
      setNote(
        network === "facebook"
          ? t("movie.noteFacebookCopyFallback")
          : t("movie.noteSocialCopyFallback"),
      );
      window.setTimeout(() => setCopied(false), 3200);
      return;
    }
    setNote(t("movie.noteSocialFailed"));
  }

  async function handleCopy() {
    setBusy("copy");
    setNote(null);
    const ok = await copyMovieShareLink(shareMovieRef.current);
    setBusy(null);
    if (ok) {
      setCopied(true);
      setNote(t("movie.noteCopied"));
      window.setTimeout(() => setCopied(false), 2200);
    } else {
      setNote(t("movie.noteCopyFailed"));
    }
  }

  async function handleSystemShare() {
    setBusy("system");
    setNote(null);
    try {
      const current = shareMovieRef.current;
      if (
        current.shareUrl &&
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        try {
          await navigator.share({
            title: current.title,
            text: `Watch “${current.title}”`,
            url: current.shareUrl,
          });
          return;
        } catch {
          // Fall through.
        }
      }
      await shareMovieFile(current);
    } finally {
      setBusy(null);
    }
  }

  function handleDownload(forNetwork?: MovieSocialNetwork) {
    setBusy(forNetwork ?? "download");
    setNote(null);
    const ok = downloadMovieFile(shareMovieRef.current);
    setBusy(null);
    if (!ok) {
      setNote(t("movie.noteDownloadUnavailable"));
      return;
    }
    if (forNetwork === "instagram") {
      setNote(t("movie.noteInstagram"));
    } else if (forNetwork === "tiktok") {
      setNote(t("movie.noteTikTok"));
    } else {
      setNote(t("movie.noteDownloadStarted"));
    }
  }

  /**
   * Link networks (Facebook / X / Pinterest):
   * 1) Capture gesture immediately with a blank tab
   * 2) Ensure public share URL
   * 3) Navigate that tab to the sharer URL
   * 4) On block/fail → copy + visible message (never silent)
   */
  async function handleLinkShare(
    network: Exclude<MovieSocialNetwork, "instagram" | "tiktok">,
    event?: MouseEvent,
  ) {
    event?.preventDefault();
    event?.stopPropagation();

    logMovieShare("linkShare:click", {
      network,
      hasPublicUrl: Boolean(moviePublicShareUrl(shareMovieRef.current)),
    });

    // 1) Capture user gesture BEFORE any await / setState.
    const tab = openBlankShareTab();

    setBusy(network);
    // Don't clear an existing success note until we know the outcome.

    try {
      const ready = await ensurePublicShareMovie();
      const shareUrl = moviePublicShareUrl(ready);
      const href = shareUrl ? movieSocialShareUrl(network, ready) : null;

      logMovieShare("linkShare:ready", {
        network,
        shareUrl,
        href,
        tabOpen: Boolean(tab && !tab.closed),
      });

      if (!shareUrl || !href) {
        if (tab && !tab.closed) tab.close();
        setNote(t("movie.noteShareLinkFailed"));
        return;
      }

      const nav = navigateShareTab(href, tab);
      if (nav.opened) {
        setNote(
          network === "facebook"
            ? t("movie.noteFacebookOpened")
            : t("movie.noteSocialOpened"),
        );
        return;
      }

      if (tab && !tab.closed) {
        try {
          tab.close();
        } catch {
          // ignore
        }
      }

      await fallbackCopyForNetwork(network);
    } catch (err) {
      console.error("[movie.share] linkShare failed", network, err);
      if (tab && !tab.closed) {
        try {
          tab.close();
        } catch {
          // ignore
        }
      }
      setNote(t("movie.noteShareLinkFailed"));
    } finally {
      setBusy(null);
    }
  }

  function handleSocial(
    network: MovieSocialNetwork,
    event?: MouseEvent,
  ) {
    event?.preventDefault();
    event?.stopPropagation();

    if (network === "instagram" || network === "tiktok") {
      setNote(null);
      handleDownload(network);
      return;
    }

    void handleLinkShare(network, event);
  }

  if (bootstrapping && !anyUrl) {
    return createPortal(
      <div
        ref={dialogRef}
        className="movie-share-dialog fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-share-loading-title"
        tabIndex={-1}
        onClick={onClose}
      >
        <div
          className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-canvas p-6 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
          <p id="movie-share-loading-title" className="text-sm text-ink">
            {t("movie.preparingShare")}
          </p>
        </div>
      </div>,
      document.body,
    );
  }

  if (!anyUrl && !bootstrapping) {
    return createPortal(
      <div
        ref={dialogRef}
        className="movie-share-dialog fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-share-unavailable-title"
        tabIndex={-1}
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl bg-canvas p-6 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <p
            id="movie-share-unavailable-title"
            className="font-display text-xl text-ink"
          >
            {t("movie.notReadyTitle")}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {t("movie.notReadyBody")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-primary mt-5"
          >
            {t("common.close")}
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={dialogRef}
      className="movie-share-dialog fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="movie-share-title"
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-canvas shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-ink/8 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-deep">
              {t("movie.shareEyebrow")}
            </p>
            <h2
              id="movie-share-title"
              className="mt-1 truncate font-display text-xl tracking-tight text-ink"
            >
              {shareMovie.title}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {t("movie.shareLead")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-label={t("movie.closeShare")}
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">
          {bootstrapping ? (
            <p className="mb-3 flex items-center gap-2 text-xs text-ink-muted">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("movie.preparingShare")}
            </p>
          ) : null}

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SOCIAL_OPTIONS.map((option) => {
              const isFacebook = option.id === "facebook";
              // Native <a> is the most reliable Facebook open when URL is ready.
              if (isFacebook && facebookHref && busy === null) {
                return (
                  <li key={option.id}>
                    <a
                      href={facebookHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => {
                        logMovieShare("facebook:anchor-click", {
                          href: facebookHref,
                        });
                        // Keep dialog open; show confirmation after navigation starts.
                        setNote(t("movie.noteFacebookOpened"));
                        event.stopPropagation();
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-ink/10 bg-canvas px-3 py-3 text-left transition hover:border-accent/35 hover:bg-canvas-deep/40"
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                          option.tone,
                        )}
                        aria-hidden
                      >
                        {option.mark}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink">
                          {t(option.labelKey)}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {t(option.hintKey)}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              }

              return (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={(event) => handleSocial(option.id, event)}
                    className="flex w-full items-center gap-3 rounded-xl border border-ink/10 bg-canvas px-3 py-3 text-left transition hover:border-accent/35 hover:bg-canvas-deep/40 disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                        option.tone,
                      )}
                      aria-hidden
                    >
                      {busy === option.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        option.mark
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">
                        {t(option.labelKey)}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {t(option.hintKey)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-col gap-2 border-t border-ink/8 pt-4">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleCopy()}
              className="ui-btn ui-btn-secondary w-full justify-center"
            >
              {busy === "copy" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied ? t("movie.linkCopied") : t("movie.copyLink")}
            </button>

            {canSystemShare ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleSystemShare()}
                className="ui-btn ui-btn-primary w-full justify-center"
              >
                {busy === "system" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Share2 className="size-4" aria-hidden />
                )}
                {t("movie.share")}
              </button>
            ) : null}

            {shareMovie.downloadUrl || shareMovie.playUrl ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => handleDownload()}
                className="ui-btn ui-btn-ghost w-full justify-center"
              >
                {busy === "download" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                {t("movie.downloadMp4")}
              </button>
            ) : null}
          </div>

          {note ? (
            <p
              role="status"
              className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-center text-sm font-medium leading-relaxed text-ink"
            >
              {note}
            </p>
          ) : null}

          <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-muted">
            {t("movie.shareFootnote")}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
