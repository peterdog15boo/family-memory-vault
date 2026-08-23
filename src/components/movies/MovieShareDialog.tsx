"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { announce } from "@/lib/a11y/announce";
import type { SerializedMovie } from "@/lib/movies/serialize";
import {
  buildSocialIntentUrl,
  completeSocialShareIntent,
  copyTextToClipboard,
  downloadMovieFile,
  logMovieShare,
  moviePublicShareUrl,
  movieShareText,
  movieShareTokenFromUrl,
  movieShareUrl,
  movieSocialNetworkLabel,
  navigateShareIntent,
  openShareIntentPlaceholder,
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
 * Movie share sheet — public /share/movies/{token} page + social intents.
 */
export function MovieShareDialog({ movie, onClose }: MovieShareDialogProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shareMovie, setShareMovie] = useState(movie);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(!movie.shareUrl);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shareMovieRef = useRef(shareMovie);
  shareMovieRef.current = shareMovie;
  const toastTimer = useRef<number | null>(null);
  const ensuredIdRef = useRef<string | null>(null);

  const anyUrl = useMemo(() => movieShareUrl(shareMovie), [shareMovie]);
  const publicUrl = useMemo(
    () => moviePublicShareUrl(shareMovie),
    [shareMovie],
  );
  const canSystemShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useOverlayA11y({
    open: true,
    onClose,
    containerRef: dialogRef,
    initialFocus: "container",
  });

  function showToast(message: string) {
    setToast(message);
    announce(message, { priority: "polite" });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // Ensure durable public share page URL once (stable /share/movies/{token}).
  useEffect(() => {
    let cancelled = false;
    const movieId = movie.id;

    async function ensureShare() {
      if (movie.shareUrl) {
        ensuredIdRef.current = movieId;
        setShareMovie({ ...movie, shareUrl: movie.shareUrl });
        const token = movieShareTokenFromUrl(movie.shareUrl);
        if (token && typeof window !== "undefined") {
          setPosterUrl(
            `${window.location.origin}/api/public/movies/${encodeURIComponent(token)}/poster`,
          );
        }
        setPreparing(false);
        return;
      }
      if (ensuredIdRef.current === movieId && shareMovieRef.current.shareUrl) {
        setPreparing(false);
        return;
      }

      setPreparing(true);
      logMovieShare("dialog:ensureShare:start", { movieId });
      try {
        const res = await fetch(`/api/movies/${movieId}/share`, {
          method: "POST",
        });
        const data = (await res.json().catch(() => ({}))) as {
          shareUrl?: string;
          posterUrl?: string;
          token?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.shareUrl) {
          console.error("[movie.share] ensure failed", data);
          showToast(data.error || t("movie.noteShareLinkFailed"));
          setPreparing(false);
          return;
        }
        ensuredIdRef.current = movieId;
        const next = { ...movie, shareUrl: data.shareUrl };
        shareMovieRef.current = next;
        setShareMovie(next);
        setPosterUrl(
          data.posterUrl ||
            (data.token && typeof window !== "undefined"
              ? `${window.location.origin}/api/public/movies/${encodeURIComponent(data.token)}/poster`
              : null),
        );
        logMovieShare("dialog:ensureShare:ok", { shareUrl: data.shareUrl });
      } catch (err) {
        console.error("[movie.share] ensure exception", err);
        if (!cancelled) showToast(t("movie.noteShareLinkFailed"));
      } finally {
        if (!cancelled) setPreparing(false);
      }
    }

    void ensureShare();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per movie id
  }, [movie.id, movie.shareUrl, t]);

  async function fetchSharePage(): Promise<{
    sharePageUrl: string;
    posterUrl: string | null;
    text: string;
  }> {
    const current = shareMovieRef.current;
    if (moviePublicShareUrl(current)) {
      const token = movieShareTokenFromUrl(current.shareUrl);
      return {
        sharePageUrl: current.shareUrl!,
        posterUrl:
          posterUrl ||
          (token && typeof window !== "undefined"
            ? `${window.location.origin}/api/public/movies/${encodeURIComponent(token)}/poster`
            : null),
        text: movieShareText(current),
      };
    }

    const res = await fetch(`/api/movies/${movie.id}/share`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      shareUrl?: string;
      posterUrl?: string;
      token?: string;
      error?: string;
    };
    if (!res.ok || !data.shareUrl) {
      throw new Error(data.error || t("movie.noteShareLinkFailed"));
    }
    const next = { ...current, shareUrl: data.shareUrl };
    shareMovieRef.current = next;
    setShareMovie(next);
    const nextPoster =
      data.posterUrl ||
      (data.token && typeof window !== "undefined"
        ? `${window.location.origin}/api/public/movies/${encodeURIComponent(data.token)}/poster`
        : null);
    if (nextPoster) setPosterUrl(nextPoster);
    return {
      sharePageUrl: data.shareUrl,
      posterUrl: nextPoster,
      text: movieShareText(next),
    };
  }

  async function handleCopy() {
    setBusy("copy");
    try {
      const ready = await fetchSharePage();
      const ok = await copyTextToClipboard(ready.sharePageUrl);
      if (ok) {
        setCopied(true);
        showToast(t("movie.noteCopied"));
        window.setTimeout(() => setCopied(false), 2200);
      } else {
        showToast(t("movie.noteCopyFailed"));
      }
    } catch {
      showToast(t("movie.noteShareLinkFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleSystemShare() {
    setBusy("system");
    try {
      const ready = await fetchSharePage();
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: shareMovieRef.current.title,
            text: ready.text,
            url: ready.sharePageUrl,
          });
          return;
        } catch {
          // fall through
        }
      }
      await shareMovieFile(shareMovieRef.current);
    } finally {
      setBusy(null);
    }
  }

  function handleDownload(forNetwork?: MovieSocialNetwork) {
    setBusy(forNetwork ?? "download");
    const ok = downloadMovieFile(shareMovieRef.current);
    setBusy(null);
    if (!ok) {
      showToast(t("movie.noteDownloadUnavailable"));
      return;
    }
    if (forNetwork === "instagram") showToast(t("movie.noteInstagram"));
    else if (forNetwork === "tiktok") showToast(t("movie.noteTikTok"));
    else showToast(t("movie.noteDownloadStarted"));
  }

  async function handleLinkNetwork(
    network: "facebook" | "x" | "pinterest",
  ) {
    logMovieShare("link:click", {
      network,
      hasPublic: Boolean(publicUrl),
    });

    // 1) Capture gesture immediately.
    const placeholder = openShareIntentPlaceholder();

    // 2) If the public page URL is already ready, navigate in the same turn
    //    (no await) so browsers keep the gesture-associated tab.
    if (publicUrl) {
      const href = buildSocialIntentUrl(network, {
        sharePageUrl: publicUrl,
        text: movieShareText(shareMovieRef.current),
        posterUrl,
      });
      const nav = navigateShareIntent(href, placeholder);
      if (nav.opened) {
        showToast(
          t("movie.noteSocialOpenedNamed", {
            network: movieSocialNetworkLabel(network),
          }),
        );
        return;
      }
      if (placeholder && !placeholder.closed) {
        try {
          placeholder.close();
        } catch {
          // ignore
        }
      }
      const copiedOk = await copyTextToClipboard(publicUrl);
      showToast(
        copiedOk
          ? t("movie.noteSocialCopyNamed", {
              network: movieSocialNetworkLabel(network),
            })
          : t("movie.noteSocialFailed"),
      );
      return;
    }

    // 3) Need to create the share page first — placeholder already open.
    setBusy(network);
    try {
      const result = await completeSocialShareIntent({
        network,
        placeholder,
        ensureSharePage: fetchSharePage,
      });

      if (result.opened) {
        showToast(
          t("movie.noteSocialOpenedNamed", {
            network: movieSocialNetworkLabel(network),
          }),
        );
        return;
      }

      if (result.copied && result.sharePageUrl) {
        setCopied(true);
        showToast(
          t("movie.noteSocialCopyNamed", {
            network: movieSocialNetworkLabel(network),
          }),
        );
        window.setTimeout(() => setCopied(false), 3200);
        return;
      }

      showToast(result.error || t("movie.noteSocialFailed"));
    } finally {
      setBusy(null);
    }
  }

  if (!anyUrl && !preparing && !publicUrl) {
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
          onClick={(e) => e.stopPropagation()}
        >
          <p
            id="movie-share-unavailable-title"
            className="font-display text-xl text-ink"
          >
            {t("movie.notReadyTitle")}
          </p>
          <p className="mt-2 text-sm text-ink-muted">{t("movie.notReadyBody")}</p>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-primary mt-5">
            {t("common.close")}
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <>
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
          onClick={(e) => e.stopPropagation()}
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
              <p className="mt-1 text-sm text-ink-muted">{t("movie.shareLead")}</p>
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
            {preparing ? (
              <p className="mb-3 flex items-center gap-2 text-xs text-ink-muted">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {t("movie.preparingShare")}
              </p>
            ) : null}

            {publicUrl ? (
              <p className="mb-3 truncate rounded-lg bg-ink/5 px-3 py-2 text-[11px] text-ink-muted">
                {publicUrl}
              </p>
            ) : null}

            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SOCIAL_OPTIONS.map((option) => {
                const isLink =
                  option.id === "facebook" ||
                  option.id === "x" ||
                  option.id === "pinterest";

                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={busy !== null || (isLink && preparing)}
                      onClick={() => {
                        if (
                          option.id === "facebook" ||
                          option.id === "x" ||
                          option.id === "pinterest"
                        ) {
                          void handleLinkNetwork(option.id);
                          return;
                        }
                        handleDownload(option.id);
                      }}
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

            <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-muted">
              {t("movie.shareFootnote")}
            </p>
          </div>
        </div>
      </div>

      {toast ? (
        <div
          className="journey-toast fixed bottom-6 left-1/2 z-[120] max-w-[min(92vw,28rem)] -translate-x-1/2"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </>,
    document.body,
  );
}
