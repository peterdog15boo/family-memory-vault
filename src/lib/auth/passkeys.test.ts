import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isPasskeyUserCancellation,
  isPlatformPasskeyAvailable,
  isWebAuthnAvailable,
  passkeyErrorMessage,
  shouldOfferPasskeyEnroll,
  markPasskeyEnrollDismissed,
  markPasskeyEnrollSnoozed,
  markPasskeyEnrollSessionShown,
} from "@/lib/auth/passkeys";

vi.mock("@clerk/shared/webauthn", () => ({
  isWebAuthnSupported: vi.fn(() => true),
  isWebAuthnPlatformAuthenticatorSupported: vi.fn(async () => true),
}));

import {
  isWebAuthnSupported,
  isWebAuthnPlatformAuthenticatorSupported,
} from "@clerk/shared/webauthn";

describe("passkeys capability helpers", () => {
  const memoryStore = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => {
        map.clear();
      },
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
    };
  };

  beforeEach(() => {
    vi.mocked(isWebAuthnSupported).mockReturnValue(true);
    vi.mocked(isWebAuthnPlatformAuthenticatorSupported).mockResolvedValue(true);
    vi.stubGlobal("sessionStorage", memoryStore());
    vi.stubGlobal("localStorage", memoryStore());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports WebAuthn available via Clerk helper", () => {
    expect(isWebAuthnAvailable()).toBe(true);
    vi.mocked(isWebAuthnSupported).mockReturnValue(false);
    expect(isWebAuthnAvailable()).toBe(false);
  });

  it("requires a platform authenticator for biometric passkeys", async () => {
    expect(await isPlatformPasskeyAvailable()).toBe(true);
    vi.mocked(isWebAuthnPlatformAuthenticatorSupported).mockResolvedValue(
      false,
    );
    expect(await isPlatformPasskeyAvailable()).toBe(false);
  });

  it("hides biometrics when WebAuthn itself is missing", async () => {
    vi.mocked(isWebAuthnSupported).mockReturnValue(false);
    expect(await isPlatformPasskeyAvailable()).toBe(false);
  });

  it("detects user-cancelled passkey errors", () => {
    expect(isPasskeyUserCancellation({ name: "NotAllowedError" })).toBe(true);
    expect(
      isPasskeyUserCancellation({ code: "passkey_retrieval_cancelled" }),
    ).toBe(true);
    expect(isPasskeyUserCancellation({ code: "network_error" })).toBe(false);
  });

  it("surfaces Clerk long_message when present", () => {
    expect(
      passkeyErrorMessage(
        { errors: [{ longMessage: "Upgrade to use passkeys." }] },
        "fallback",
      ),
    ).toBe("Upgrade to use passkeys.");
    expect(passkeyErrorMessage({}, "fallback")).toBe("fallback");
  });

  it("offers enroll only when supported, empty, and not dismissed", () => {
    expect(
      shouldOfferPasskeyEnroll({
        userId: "user_1",
        hasPasskeys: false,
        platformSupported: true,
      }),
    ).toBe(true);

    expect(
      shouldOfferPasskeyEnroll({
        userId: "user_1",
        hasPasskeys: true,
        platformSupported: true,
      }),
    ).toBe(false);

    expect(
      shouldOfferPasskeyEnroll({
        userId: "user_1",
        hasPasskeys: false,
        platformSupported: false,
      }),
    ).toBe(false);

    markPasskeyEnrollDismissed("user_1");
    expect(
      shouldOfferPasskeyEnroll({
        userId: "user_1",
        hasPasskeys: false,
        platformSupported: true,
      }),
    ).toBe(false);
  });

  it("respects snooze and one-offer-per-session", () => {
    markPasskeyEnrollSnoozed("user_2");
    expect(
      shouldOfferPasskeyEnroll({
        userId: "user_2",
        hasPasskeys: false,
        platformSupported: true,
      }),
    ).toBe(false);

    localStorage.clear();
    markPasskeyEnrollSessionShown();
    expect(
      shouldOfferPasskeyEnroll({
        userId: "user_2",
        hasPasskeys: false,
        platformSupported: true,
      }),
    ).toBe(false);
  });
});
