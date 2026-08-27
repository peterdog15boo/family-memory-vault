"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useReverification, useUser } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { Fingerprint, Loader2, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import {
  isPasskeyUserCancellation,
  isPlatformPasskeyAvailable,
  passkeyErrorMessage,
  shouldOfferPasskeyEnroll,
  markPasskeyEnrollDismissed,
  markPasskeyEnrollSnoozed,
  markPasskeyEnrollSessionShown,
} from "@/lib/auth/passkeys";
import { announce } from "@/lib/a11y/announce";

/**
 * Optional post-login prompt: set up Face ID / Touch ID / Windows Hello
 * after the vault shell loads. Skippable; never blocks legal/ritual gates
 * (those redirect before DashboardShell mounts).
 */
export function PasskeyEnrollPrompt() {
  const { user, isLoaded } = useUser();
  const t = useTranslations();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descId = useId();
  const errorId = useId();

  const createPasskey = useReverification(async () => {
    if (!user) throw new Error("Not signed in");
    return user.createPasskey();
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isLoaded || !user || !mounted) return;
    let cancelled = false;

    void (async () => {
      const platformOk = await isPlatformPasskeyAvailable();
      if (cancelled) return;
      if (
        !shouldOfferPasskeyEnroll({
          userId: user.id,
          hasPasskeys: (user.passkeys?.length ?? 0) > 0,
          platformSupported: platformOk,
        })
      ) {
        return;
      }
      // Brief delay so vault chrome paints before the offer.
      window.setTimeout(() => {
        if (cancelled) return;
        markPasskeyEnrollSessionShown();
        setOpen(true);
      }, 900);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, mounted]);

  function close() {
    setOpen(false);
    setError(null);
  }

  function snooze() {
    if (user) markPasskeyEnrollSnoozed(user.id);
    close();
  }

  function neverAsk() {
    if (user) markPasskeyEnrollDismissed(user.id);
    close();
  }

  useOverlayA11y({
    open,
    onClose: snooze,
    containerRef: dialogRef,
  });

  async function enablePasskey() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createPasskey();
      markPasskeyEnrollDismissed(user.id);
      announce(t("settings.passkeyAdded"));
      await user.reload();
      close();
    } catch (err) {
      if (
        isReverificationCancelledError(err) ||
        isPasskeyUserCancellation(err)
      ) {
        return;
      }
      setError(passkeyErrorMessage(err, t("settings.passkeyAddError")));
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t("settings.passkeyEnrollNotNow")}
        onClick={snooze}
      />
      <div className="relative z-10 w-full max-w-md rounded-t-[1.25rem] border border-[color:var(--border-subtle)] bg-[color:var(--canvas)] p-5 shadow-xl sm:rounded-[1.25rem] sm:p-6">
        <button
          type="button"
          onClick={snooze}
          className="absolute right-3 top-3 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-[color:var(--canvas-deep)] hover:text-ink"
          aria-label={t("settings.passkeyEnrollNotNow")}
        >
          <X className="size-4" aria-hidden />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
            <Fingerprint className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-display text-lg tracking-tight text-ink"
            >
              {t("settings.passkeyEnrollTitle")}
            </h2>
            <p id={descId} className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {t("settings.passkeyEnrollBody")}
            </p>
          </div>
        </div>

        {error ? (
          <p id={errorId} role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => void enablePasskey()}
            disabled={busy}
            className="ui-btn ui-btn-primary"
            aria-describedby={error ? errorId : undefined}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("settings.passkeyAdding")}
              </>
            ) : (
              <>
                <Fingerprint className="size-4" aria-hidden />
                {t("settings.passkeyEnrollEnable")}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={snooze}
            disabled={busy}
            className="ui-btn ui-btn-secondary"
          >
            {t("settings.passkeyEnrollNotNow")}
          </button>
        </div>

        <button
          type="button"
          onClick={neverAsk}
          disabled={busy}
          className="mt-3 text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {t("settings.passkeyEnrollNever")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
