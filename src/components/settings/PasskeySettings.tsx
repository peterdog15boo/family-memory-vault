"use client";

import { useEffect, useId, useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { Fingerprint, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  isPasskeyUserCancellation,
  isPlatformPasskeyAvailable,
  passkeyErrorMessage,
} from "@/lib/auth/passkeys";
import { announce } from "@/lib/a11y/announce";
import { cn } from "@/lib/utils";

/**
 * Add / list / remove passkeys after sign-in. Hidden when this device has no
 * platform authenticator (no broken biometric CTA on plain desktops).
 *
 * Clerk requires session reverification before add/remove passkey — we wrap
 * those calls so the verify modal appears instead of a silent failure.
 */
export function PasskeySettings() {
  const { user, isLoaded } = useUser();
  const t = useTranslations();
  const [supported, setSupported] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  const createPasskey = useReverification(async () => {
    if (!user) throw new Error("Not signed in");
    return user.createPasskey();
  });

  const deletePasskey = useReverification(async (passkeyId: string) => {
    if (!user) throw new Error("Not signed in");
    const target = user.passkeys.find((p) => p.id === passkeyId);
    if (!target) throw new Error("Passkey not found");
    return target.delete();
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isPlatformPasskeyAvailable();
      if (!cancelled) {
        setSupported(ok);
        setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked) return null;

  const passkeys = user?.passkeys ?? [];
  const canAdd = supported && Boolean(user);
  const onLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  async function addPasskey() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createPasskey();
      announce(t("settings.passkeyAdded"));
      await user.reload();
    } catch (err) {
      if (isReverificationCancelledError(err) || isPasskeyUserCancellation(err)) {
        return;
      }
      setError(passkeyErrorMessage(err, t("settings.passkeyAddError")));
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: string) {
    if (!user || removingId) return;
    setRemovingId(id);
    setError(null);
    try {
      await deletePasskey(id);
      announce(t("settings.passkeyRemoved"));
      await user.reload();
    } catch (err) {
      if (isReverificationCancelledError(err) || isPasskeyUserCancellation(err)) {
        return;
      }
      setError(passkeyErrorMessage(err, t("settings.passkeyRemoveError")));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="mt-5 border-t border-[color:var(--border-subtle)] pt-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
          <Fingerprint className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-ink">
            {t("settings.passkeysTitle")}
          </h4>
          <p className="mt-1 text-sm text-ink-muted">
            {supported
              ? t("settings.passkeysLead")
              : t("settings.passkeysUnsupported")}
          </p>
          {supported ? (
            <p className="mt-2 text-xs text-ink-muted">
              {t("settings.passkeysVerifyHint")}
            </p>
          ) : null}
          {supported && onLocalhost ? (
            <p className="mt-2 text-xs text-ink-muted">
              {t("settings.passkeysLocalhostHint")}
            </p>
          ) : null}
        </div>
      </div>

      {passkeys.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {passkeys.map((pk) => (
            <li
              key={pk.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {pk.name || t("settings.passkeyUnnamed")}
                </p>
                {pk.createdAt ? (
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {t("settings.passkeyCreated", {
                      date: new Date(pk.createdAt).toLocaleDateString(),
                    })}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void removePasskey(pk.id)}
                disabled={removingId === pk.id || !isLoaded}
                className={cn(
                  "ui-btn ui-btn-secondary ui-btn-sm shrink-0",
                  "text-ink-muted hover:text-ink",
                )}
                aria-label={t("settings.passkeyRemove")}
              >
                {removingId === pk.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          {t("settings.passkeysEmpty")}
        </p>
      )}

      {canAdd ? (
        <button
          type="button"
          onClick={() => void addPasskey()}
          disabled={!isLoaded || busy}
          className="ui-btn ui-btn-secondary ui-btn-sm mt-4"
          aria-describedby={error ? errorId : undefined}
        >
          {busy ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("settings.passkeyAdding")}
            </>
          ) : (
            <>
              <Fingerprint className="size-3.5" aria-hidden />
              {t("settings.passkeyAdd")}
            </>
          )}
        </button>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
