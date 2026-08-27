/**
 * Passkey / WebAuthn capability checks for Family Memory Vault.
 *
 * Prefer Clerk’s shared helpers when available; fall back to the browser
 * PublicKeyCredential APIs so unsupported desktops never show a biometric button.
 */

import {
  isWebAuthnPlatformAuthenticatorSupported as clerkPlatformSupported,
  isWebAuthnSupported as clerkWebAuthnSupported,
} from "@clerk/shared/webauthn";

/** Sync: browser exposes the WebAuthn credential API. */
export function isWebAuthnAvailable(): boolean {
  try {
    return clerkWebAuthnSupported();
  } catch {
    return (
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined"
    );
  }
}

/**
 * Async: device has a platform authenticator (Face ID, Touch ID, Windows Hello).
 * Cross-platform security keys alone do not count — we only advertise biometrics
 * when a platform authenticator is present.
 */
export async function isPlatformPasskeyAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;

  try {
    return await clerkPlatformSupported();
  } catch {
    if (typeof window === "undefined") return false;
    try {
      const pk = window.PublicKeyCredential;
      if (!pk?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
      return await pk.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }
}

/** True when the error is a user-cancelled WebAuthn / passkey prompt. */
export function isPasskeyUserCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    name?: string;
    code?: string;
    errors?: Array<{ code?: string }>;
  };
  if (err.name === "AbortError" || err.name === "NotAllowedError") return true;
  if (err.code === "passkey_retrieval_cancelled") return true;
  if (err.code === "passkey_registration_cancelled") return true;
  if (
    Array.isArray(err.errors) &&
    err.errors.some(
      (e) =>
        e.code === "passkey_retrieval_cancelled" ||
        e.code === "passkey_registration_cancelled",
    )
  ) {
    return true;
  }
  return false;
}

/** Prefer Clerk’s human-readable message when passkey create/sign-in fails. */
export function passkeyErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!error || typeof error !== "object") return fallback;
  const err = error as {
    message?: string;
    longMessage?: string;
    errors?: Array<{ longMessage?: string; message?: string; code?: string }>;
  };
  const nested = err.errors?.[0];
  const text =
    nested?.longMessage?.trim() ||
    nested?.message?.trim() ||
    err.longMessage?.trim() ||
    err.message?.trim();
  return text || fallback;
}

const PASSKEY_ENROLL_SESSION_SHOWN = "fmv:passkey-enroll:session-shown";
const PASSKEY_ENROLL_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function dismissKey(userId: string): string {
  return `fmv:passkey-enroll:dismiss:${userId}`;
}

function snoozeKey(userId: string): string {
  return `fmv:passkey-enroll:snooze:${userId}`;
}

/** Whether the post-login passkey offer should appear in the vault shell. */
export function shouldOfferPasskeyEnroll(input: {
  userId: string;
  hasPasskeys: boolean;
  platformSupported: boolean;
}): boolean {
  if (!input.platformSupported || input.hasPasskeys) return false;

  try {
    if (typeof sessionStorage === "undefined" || typeof localStorage === "undefined") {
      return false;
    }
    if (sessionStorage.getItem(PASSKEY_ENROLL_SESSION_SHOWN) === "1") {
      return false;
    }
    if (localStorage.getItem(dismissKey(input.userId)) === "1") {
      return false;
    }
    const snoozeUntil = Number(
      localStorage.getItem(snoozeKey(input.userId)) || "0",
    );
    if (Number.isFinite(snoozeUntil) && Date.now() < snoozeUntil) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function markPasskeyEnrollSessionShown(): void {
  try {
    sessionStorage.setItem(PASSKEY_ENROLL_SESSION_SHOWN, "1");
  } catch {
    // ignore
  }
}

export function markPasskeyEnrollDismissed(userId: string): void {
  try {
    localStorage.setItem(dismissKey(userId), "1");
    localStorage.removeItem(snoozeKey(userId));
  } catch {
    // ignore
  }
}

export function markPasskeyEnrollSnoozed(userId: string): void {
  try {
    localStorage.setItem(
      snoozeKey(userId),
      String(Date.now() + PASSKEY_ENROLL_SNOOZE_MS),
    );
  } catch {
    // ignore
  }
}
