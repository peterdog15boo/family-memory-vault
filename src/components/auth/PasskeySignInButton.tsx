"use client";

import { useEffect, useId, useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Fingerprint, Loader2 } from "lucide-react";
import {
  isPasskeyUserCancellation,
  isPlatformPasskeyAvailable,
  passkeyErrorMessage,
} from "@/lib/auth/passkeys";
import { cn } from "@/lib/utils";

type PasskeySignInButtonProps = {
  /** Same post-auth destination as Clerk SignIn forceRedirectUrl. */
  redirectUrl: string;
  className?: string;
};

/**
 * Discoverable passkey sign-in. Renders only when this device has a platform
 * authenticator (Face ID / Touch ID / Windows Hello). Google/email stay in
 * the Clerk SignIn widget below.
 */
export function PasskeySignInButton({
  redirectUrl,
  className,
}: PasskeySignInButtonProps) {
  const { signIn, fetchStatus, errors } = useSignIn();
  const [supported, setSupported] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const errorId = useId();

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

  if (!checked || !supported) return null;

  async function onPasskeySignIn() {
    if (!signIn || busy || fetchStatus === "fetching") return;
    setBusy(true);
    setErrorMessage(null);

    try {
      const { error } = await signIn.passkey({ flow: "discoverable" });
      if (error) {
        if (!isPasskeyUserCancellation(error)) {
          setErrorMessage(
            passkeyErrorMessage(
              error,
              "Passkey sign-in didn’t complete. Try Google or email instead.",
            ),
          );
        }
        return;
      }

      if (signIn.status === "complete") {
        await signIn.finalize({
          navigate: async ({ decorateUrl }) => {
            const url = decorateUrl(redirectUrl);
            if (url.startsWith("http")) {
              window.location.href = url;
            } else {
              window.location.replace(url);
            }
          },
        });
        return;
      }

      // MFA / client trust — leave Clerk SignIn widget to continue factors.
      setErrorMessage(
        "Additional verification is needed. Continue with email or Google below.",
      );
    } catch (err) {
      if (!isPasskeyUserCancellation(err)) {
        setErrorMessage(
          "Passkey sign-in didn’t complete. Try Google or email instead.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const globalError = errors?.global?.[0]?.message;
  const showError = errorMessage || globalError;

  return (
    <div className={cn("auth-passkey-block mb-4 w-full", className)}>
      <button
        type="button"
        onClick={() => void onPasskeySignIn()}
        disabled={busy || fetchStatus === "fetching"}
        className={cn(
          "auth-passkey-btn flex w-full items-center justify-center gap-2 rounded-[0.85rem]",
          "border border-[rgba(42,38,35,0.12)] bg-white/90 px-4 py-2.5 text-sm font-medium text-[#2a2623]",
          "transition-colors hover:bg-white",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
        aria-describedby={showError ? errorId : undefined}
      >
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Fingerprint className="size-4 shrink-0 opacity-80" aria-hidden />
        )}
        <span>Sign in with Face ID / Touch ID / Passkey</span>
      </button>
      {showError ? (
        <p
          id={errorId}
          role="alert"
          className="mt-2 text-center text-xs text-[#9d5d4e]"
        >
          {showError}
        </p>
      ) : null}
    </div>
  );
}
