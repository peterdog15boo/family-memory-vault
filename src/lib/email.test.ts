import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_FROM,
  DEFAULT_EMAIL_REPLY_TO,
  getEmailFromAddress,
  getEmailReplyToAddress,
} from "@/lib/email";

describe("email from / reply-to config", () => {
  const keys = ["EMAIL_FROM", "EMAIL_REPLY_TO"] as const;
  const snapshot = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of keys) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults to verified mail.familymemoryvault.ai support address", () => {
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_REPLY_TO;
    expect(getEmailFromAddress()).toBe(DEFAULT_EMAIL_FROM);
    expect(DEFAULT_EMAIL_FROM).toContain("support@mail.familymemoryvault.ai");
    expect(getEmailReplyToAddress()).toBe(DEFAULT_EMAIL_REPLY_TO);
    expect(DEFAULT_EMAIL_REPLY_TO).toBe("support@familymemoryvault.ai");
  });

  it("prefers EMAIL_FROM and EMAIL_REPLY_TO when set", () => {
    process.env.EMAIL_FROM =
      "Family Memory Vault <ops@mail.familymemoryvault.ai>";
    process.env.EMAIL_REPLY_TO = "hello@mail.familymemoryvault.ai";
    expect(getEmailFromAddress()).toBe(
      "Family Memory Vault <ops@mail.familymemoryvault.ai>",
    );
    expect(getEmailReplyToAddress()).toBe("hello@mail.familymemoryvault.ai");
  });
});
