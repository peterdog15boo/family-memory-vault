import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isPasskeyUserCancellation,
  isPlatformPasskeyAvailable,
  isWebAuthnAvailable,
  passkeyErrorMessage,
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
  beforeEach(() => {
    vi.mocked(isWebAuthnSupported).mockReturnValue(true);
    vi.mocked(isWebAuthnPlatformAuthenticatorSupported).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
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
});
