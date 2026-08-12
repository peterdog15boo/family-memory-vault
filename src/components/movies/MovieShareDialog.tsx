"use client";

import { useRef, useState } from "react";
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
  movieShareUrl,
  openMovieSocialShare,
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
  /** Simple brand mark drawn with CSS (no icon pack dependency). */
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
 * In-app movie share sheet — portaled above shell chrome so it never
 * stacks under Modern page cards / FABs. Social networks that accept
 * links open in a popup; Instagram / TikTok guide a download-first flow.
 */
export function MovieShareDialog({ movie, onClose }: MovieShareDialogProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shareUrl = movieShareUrl(movie);
  const canSystemShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  useOverlayA11y({
    open: true,
    onClose,
    containerRef: dialogRef,
  });

  async function handleCopy() {
    setBusy("copy");
    setNote(null);
    const ok = await copyMovieShareLink(movie);
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
      await shareMovieFile(movie);
    } finally {
      setBusy(null);
    }
  }

  function handleDownload(forNetwork?: MovieSocialNetwork) {
    setBusy(forNetwork ?? "download");
    setNote(null);
    const ok = downloadMovieFile(movie);
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

  function handleSocial(network: MovieSocialNetwork) {
    setNote(null);
    if (network === "instagram" || network === "tiktok") {
      handleDownload(network);
      return;
    }
    const ok = openMovieSocialShare(network, movie);
    if (!ok) {
      setNote(t("movie.noteSocialFailed"));
    }
  }

  if (!shareUrl) {
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
              {movie.title}
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
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SOCIAL_OPTIONS.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => handleSocial(option.id)}
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
            ))}
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

            {movie.downloadUrl || movie.playUrl ? (
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

            {canSystemShare ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void handleSystemShare()}
                className="ui-btn ui-btn-ghost w-full justify-center"
              >
                {busy === "system" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Share2 className="size-4" aria-hidden />
                )}
                {t("movie.moreSharing")}
              </button>
            ) : null}
          </div>

          {note ? (
            <p
              className="mt-4 rounded-lg bg-accent/10 px-3 py-2 text-sm leading-relaxed text-ink"
              role="status"
            >
              {note}
            </p>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              {t("movie.shareFootnote")}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
