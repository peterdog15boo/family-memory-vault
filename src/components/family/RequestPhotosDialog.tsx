"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Loader2, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  DEFAULT_PHOTO_REQUEST_MESSAGE,
  PHOTO_REQUEST_PRESETS,
} from "@/lib/photo-requests/copy";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { useRef } from "react";

type RequestPhotosDialogProps = {
  familyId: string;
  targetMemberId: string;
  targetLabel: string;
  memoryId?: string | null;
  personId?: string | null;
  onClose: () => void;
  onCreated?: () => void;
};

/**
 * Ask a family member / invitee to upload photos — preset-friendly message.
 */
export function RequestPhotosDialog({
  familyId,
  targetMemberId,
  targetLabel,
  memoryId = null,
  personId = null,
  onClose,
  onCreated,
}: RequestPhotosDialogProps) {
  const t = useTranslations();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState(DEFAULT_PHOTO_REQUEST_MESSAGE);
  const [error, setError] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  useOverlayA11y({
    open: true,
    onClose,
    containerRef: dialogRef,
  });

  const presets = useMemo(() => [...PHOTO_REQUEST_PRESETS], []);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/family/photo-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            targetMemberId,
            message,
            memoryId,
            personId,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          deepLink?: string;
        };
        if (!res.ok || !data.deepLink) {
          throw new Error(data.error || t("family.requestPhotosFailed"));
        }
        setDeepLink(data.deepLink);
        onCreated?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("family.requestPhotosFailed"),
        );
      }
    });
  }

  async function copyLink() {
    if (!deepLink || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("family.requestPhotosCopyFailed"));
    }
  }

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-photos-title"
      tabIndex={-1}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-canvas p-5 shadow-2xl sm:rounded-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="request-photos-title"
              className="font-display text-xl tracking-tight text-ink"
            >
              {t("family.requestPhotosTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {t("family.requestPhotosLead", { name: targetLabel })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink-muted hover:bg-ink/5 hover:text-ink"
            aria-label={t("common.close")}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {deepLink ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm leading-relaxed text-ink">
              {t("family.requestPhotosSent")}
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="ui-btn ui-btn-secondary w-full justify-center"
            >
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              {copied
                ? t("family.requestPhotosCopied")
                : t("family.requestPhotosCopyLink")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-primary w-full justify-center"
            >
              {t("common.done")}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMessage(preset)}
                  className="rounded-full border border-ink/12 px-3 py-1.5 text-left text-xs text-ink-muted transition hover:border-accent/40 hover:text-ink"
                >
                  {preset.length > 42 ? `${preset.slice(0, 42)}…` : preset}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="text-sm font-medium text-ink">
                {t("family.requestPhotosMessage")}
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={500}
                rows={4}
                className="mt-1.5 w-full resize-y rounded-md border border-ink/12 bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
              />
            </label>
            {error ? (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={pending || !message.trim()}
              onClick={submit}
              className="ui-btn ui-btn-primary w-full justify-center"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {t("family.requestPhotosSend")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
