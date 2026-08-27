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
