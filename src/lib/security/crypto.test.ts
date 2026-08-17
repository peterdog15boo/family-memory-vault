import { afterEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  EncryptionKeyError,
  getPlaidTokenEncryptionKey,
} from "./crypto";

const HEX_KEY = "a".repeat(64);

describe("crypto", () => {
  afterEach(() => {
    delete process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  });

  it("round-trips plaintext with a hex key", () => {
    process.env.PLAID_TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const key = getPlaidTokenEncryptionKey();
    const cipher = encryptSecret("access-sandbox-xyz", key);
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(decryptSecret(cipher, key)).toBe("access-sandbox-xyz");
  });

  it("produces different ciphertext each time (random IV)", () => {
    process.env.PLAID_TOKEN_ENCRYPTION_KEY = HEX_KEY;
    const key = getPlaidTokenEncryptionKey();
    const a = encryptSecret("same", key);
    const b = encryptSecret("same", key);
    expect(a).not.toBe(b);
  });

  it("rejects missing encryption key", () => {
    expect(() => getPlaidTokenEncryptionKey()).toThrow(EncryptionKeyError);
  });
});
