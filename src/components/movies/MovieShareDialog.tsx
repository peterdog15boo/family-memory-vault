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
  copyTextToClipboard,
  downloadMovieFile,
  logMovieShare,
  moviePublicShareUrl,
  movieShareText,
  movieShareTokenFromUrl,
  movieShareUrl,
  movieSocialNetworkLabel,
  normalizePublicSharePageUrl,
  openSocialIntentWindow,
  shareMovieFile,
  shareToSocialNetwork,
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
 * Reliability-first movie share sheet.
 * Copy Link is the dependable core; social intents are best-effort with copy fallback.
 */
export function MovieShareDialog({ movie, onClose }: MovieShareDialogProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /** Always-visible status inside the dialog (never silent). */
  const [status, setStatus] = useState<string | null>(null);
  const [shareMovie, setShareMovie] = useState(movie);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(!movie.shareUrl);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shareMovieRef = useRef(shareMovie);
  shareMovieRef.current = shareMovie;
  const publicUrlRef = useRef<string | null>(movie.shareUrl ?? null);
  const posterUrlRef = useRef<string | null>(null);
  const ensuredIdRef = useRef<string | null>(null);

  const anyUrl = useMemo(() => movieShareUrl(shareMovie), [shareMovie]);
  const publicUrl = useMemo(() => {
    const raw = moviePublicShareUrl(shareMovie);
    return raw ? normalizePublicSharePageUrl(raw) : null;
  }, [shareMovie]);
  publicUrlRef.current = publicUrl;
  posterUrlRef.current = posterUrl;

  const canSystemShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useOverlayA11y({
    open: true,
    onClose,
    containerRef: dialogRef,
    initialFocus: "container",
  });

  function setVisibleStatus(message: string) {
    setStatus(message);
    announce(message, { priority: "polite" });
    logMovieShare("ui:status", { message });
  }

  useEffect(() => {
    let cancelled = false;
    const movieId = movie.id;

    async function ensureShare() {
      if (movie.shareUrl) {
        ensuredIdRef.current = movieId;
        const normalized = normalizePublicSharePageUrl(movie.shareUrl);
        const next = { ...movie, shareUrl: normalized };
        shareMovieRef.current = next;
        setShareMovie(next);
        publicUrlRef.current = normalized;
        const token = movieShareTokenFromUrl(normalized);
        if (token && typeof window !== "undefined") {
          const poster = `${window.location.origin}/api/public/movies/${encodeURIComponent(token)}/poster`;
          posterUrlRef.current = poster;
          setPosterUrl(poster);
        }
        setPreparing(false);
        logMovieShare("ensure:fromProp", { sharePageUrl: normalized });
        return;
      }
      if (ensuredIdRef.current === movieId && shareMovieRef.current.shareUrl) {
        setPreparing(false);
        return;
      }

      setPreparing(true);
      logMovieShare("ensure:start", { movieId });
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
          console.error("[movie.share] ensure failed", {
            status: res.status,
            data,
          });
          setVisibleStatus(data.error || t("movie.noteShareLinkFailed"));
          setPreparing(false);
          return;
        }
        ensuredIdRef.current = movieId;
        const normalized = normalizePublicSharePageUrl(data.shareUrl);
        const next = { ...movie, shareUrl: normalized };
        shareMovieRef.current = next;
        setShareMovie(next);
        publicUrlRef.current = normalized;
        const poster =
          data.posterUrl ||
          (data.token && typeof window !== "undefined"
            ? `${window.location.origin}/api/public/movies/${encodeURIComponent(data.token)}/poster`
            : null);
        if (poster) {
          const normalizedPoster = normalizePublicSharePageUrl(poster);
          posterUrlRef.current = normalizedPoster;
          setPosterUrl(normalizedPoster);
        }
        logMovieShare("ensure:ok", {
          sharePageUrl: normalized,
          posterUrl: poster,
          token: data.token,
        });
      } catch (err) {
        console.error("[movie.share] ensure exception", err);
        if (!cancelled) {
          setVisibleStatus(t("movie.noteShareLinkFailed"));
        }
      } finally {
        if (!cancelled) setPreparing(false);
      }
    }

    void ensureShare();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id, movie.shareUrl, t]);

  async function resolveSharePageUrl(): Promise<string> {
    const existing = publicUrlRef.current;
    if (existing) return existing;

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
    const normalized = normalizePublicSharePageUrl(data.shareUrl);
    const next = { ...shareMovieRef.current, shareUrl: normalized };
    shareMovieRef.current = next;
    setShareMovie(next);
    publicUrlRef.current = normalized;
    if (data.posterUrl) {
      const p = normalizePublicSharePageUrl(data.posterUrl);
      posterUrlRef.current = p;
      setPosterUrl(p);
    }
    logMovieShare("resolveSharePageUrl", { sharePageUrl: normalized });
    return normalized;
  }

  /** Dependable core — always copies the public share page URL. */
  async function handleCopy() {
    setBusy("copy");
    setStatus(null);
    try {
      const pageUrl = await resolveSharePageUrl();
      logMovieShare("copy:start", { sharePageUrl: pageUrl });
      const ok = await copyTextToClipboard(pageUrl);
      if (ok) {
        setCopied(true);
        setVisibleStatus(t("movie.linkCopiedToast"));
        window.setTimeout(() => setCopied(false), 2200);
      } else {
        setVisibleStatus(t("movie.noteCopyFailed"));
      }
    } catch (err) {
      console.error("[movie.share] copy failed", err);
      setVisibleStatus(
        err instanceof Error ? err.message : t("movie.noteShareLinkFailed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleSystemShare() {
    setBusy("system");
    setStatus(null);
    try {
      const pageUrl = await resolveSharePageUrl();
      const title = shareMovieRef.current.title;
      const text = movieShareText(shareMovieRef.current);
      logMovieShare("systemShare:start", { sharePageUrl: pageUrl });
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title, text, url: pageUrl });
          setVisibleStatus(t("movie.noteSystemShareDone"));
          return;
        } catch (err) {
          // User cancel — don't treat as hard failure.
          if (err instanceof Error && err.name === "AbortError") {
            logMovieShare("systemShare:aborted");
            return;
          }
          console.warn("[movie.share] navigator.share failed", err);
        }
      }
      await shareMovieFile({ ...shareMovieRef.current, shareUrl: pageUrl });
    } catch (err) {
      console.error("[movie.share] system share failed", err);
      setVisibleStatus(t("movie.noteSocialFailed"));
    } finally {
      setBusy(null);
    }
  }

  function handleDownload(forNetwork?: MovieSocialNetwork) {
    setBusy(forNetwork ?? "download");
    const ok = downloadMovieFile(shareMovieRef.current);
    setBusy(null);
    if (!ok) {
      setVisibleStatus(t("movie.noteDownloadUnavailable"));
      return;
    }
    if (forNetwork === "instagram") setVisibleStatus(t("movie.noteInstagram"));
    else if (forNetwork === "tiktok") setVisibleStatus(t("movie.noteTikTok"));
    else setVisibleStatus(t("movie.noteDownloadStarted"));
  }

  /**
   * Facebook / X / Pinterest — direct window.open(intent) under the click.
   * No about:blank hop. No setState/await before open when the URL is ready.
   * If blocked → copy public page URL + visible status (never silent).
   */
  async function handleLinkNetwork(
    network: "facebook" | "x" | "pinterest",
  ) {
    const label = movieSocialNetworkLabel(network);
    const readyUrl = publicUrlRef.current;

    // Fast path: public URL ready — open BEFORE any await/setState.
    if (readyUrl) {
      const intentUrl = buildSocialIntentUrl(network, {
        sharePageUrl: readyUrl,
        text: movieShareText(shareMovieRef.current),
        posterUrl: posterUrlRef.current,
      });
      logMovieShare("link:fastPath:open", {
        network,
        sharePageUrl: readyUrl,
        intentUrl,
      });
      const open = openSocialIntentWindow(intentUrl);
      if (open.opened) {
        setVisibleStatus(t("movie.noteSocialOpenedNamed", { network: label }));
        return;
      }
      logMovieShare("link:fastPath:blocked", {
        network,
        windowOpenReturnedNull: open.windowOpenReturnedNull,
      });
      const copiedOk = await copyTextToClipboard(readyUrl);
      if (copiedOk) {
        setCopied(true);
        setVisibleStatus(t("movie.noteSocialCopyNamed", { network: label }));
        window.setTimeout(() => setCopied(false), 2800);
      } else {
        setVisibleStatus(t("movie.noteSocialFailed"));
      }
      return;
    }

    // Slow path: create share page first (await) — expect copy fallback.
    setBusy(network);
    setStatus(null);
    try {
      const pageUrl = await resolveSharePageUrl();
      const result = await shareToSocialNetwork({
        network,
        sharePageUrl: pageUrl,
        text: movieShareText(shareMovieRef.current),
        posterUrl: posterUrlRef.current,
      });
      logMovieShare("link:slowPath", {
        network,
        opened: result.opened,
        windowOpenReturnedNull: result.windowOpenReturnedNull,
        intentUrl: result.intentUrl,
        sharePageUrl: result.sharePageUrl,
        copied: result.copied,
      });
      if (result.opened) {
        setVisibleStatus(t("movie.noteSocialOpenedNamed", { network: label }));
        return;
      }
      if (result.copied) {
        setCopied(true);
        setVisibleStatus(t("movie.noteSocialCopyNamed", { network: label }));
        window.setTimeout(() => setCopied(false), 2800);
        return;
      }
      setVisibleStatus(t("movie.noteSocialFailed"));
    } catch (err) {
      console.error("[movie.share] link network failed", network, err);
      setVisibleStatus(
        err instanceof Error ? err.message : t("movie.noteSocialFailed"),
      );
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
          {status ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {status}
            </p>
          ) : null}
          <button type="button" onClick={onClose} className="ui-btn ui-btn-primary mt-5">
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

          {/* 1) Copy Link — dependable core */}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleCopy()}
            className="ui-btn ui-btn-primary mb-3 w-full justify-center"
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
              className="ui-btn ui-btn-secondary mb-3 w-full justify-center"
            >
              {busy === "system" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Share2 className="size-4" aria-hidden />
              )}
              {t("movie.share")}
            </button>
          ) : null}

          {publicUrl ? (
            <p className="mb-3 break-all rounded-lg bg-ink/5 px-3 py-2 text-[11px] leading-snug text-ink-muted">
              {publicUrl}
            </p>
          ) : null}

          {status ? (
            <p
              role="status"
              className="mb-3 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2.5 text-center text-sm font-semibold leading-relaxed text-ink"
            >
              {status}
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
                    disabled={busy !== null || (isLink && preparing && !publicUrl)}
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

          {shareMovie.downloadUrl || shareMovie.playUrl ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => handleDownload()}
              className="ui-btn ui-btn-ghost mt-4 w-full justify-center"
            >
              {busy === "download" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              {t("movie.downloadMp4")}
            </button>
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
