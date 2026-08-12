import { afterEach, describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "@/lib/push/browser";
import { isGonePushStatus } from "@/lib/push/send";
import {
  extractEmailFromFromHeader,
  getWebPushVapid,
  resolveVapidSubject,
} from "@/lib/push/vapid";

describe("VAPID helpers", () => {
  const keys = [
    "WEB_PUSH_VAPID_PUBLIC_KEY",
    "WEB_PUSH_VAPID_PRIVATE_KEY",
    "WEB_PUSH_VAPID_SUBJECT",
    "EMAIL_FROM",
    "NEXT_PUBLIC_APP_URL",
    "APP_URL",
  ] as const;
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

  it("resolves mailto from EMAIL_FROM and https app URL", () => {
    expect(
      extractEmailFromFromHeader("Family Memory Vault <hello@example.com>"),
    ).toBe("hello@example.com");
    expect(
      resolveVapidSubject({
        emailFrom: "Family Memory Vault <ops@family.test>",
      }),
    ).toBe("mailto:ops@family.test");
    expect(
      resolveVapidSubject({ appUrl: "https://vault.example.com/" }),
    ).toBe("https://vault.example.com");
    expect(resolveVapidSubject({ explicit: "mailto:a@b.co" })).toBe(
      "mailto:a@b.co",
    );
    expect(resolveVapidSubject({ appUrl: "http://localhost:3000" })).toBe(
      "mailto:hello@localhost",
    );
  });

  it("requires both VAPID keys", () => {
    delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    expect(getWebPushVapid()).toBeNull();

    process.env.WEB_PUSH_VAPID_PUBLIC_KEY = "pub";
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY = "priv";
    process.env.WEB_PUSH_VAPID_SUBJECT = "mailto:dev@example.com";
    expect(getWebPushVapid()).toEqual({
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:dev@example.com",
    });
  });
});

describe("push helpers", () => {
  it("treats gone endpoints as pruneable", () => {
    expect(isGonePushStatus(410)).toBe(true);
    expect(isGonePushStatus(404)).toBe(true);
    expect(isGonePushStatus(403)).toBe(true);
    expect(isGonePushStatus(500)).toBe(false);
  });

  it("decodes VAPID applicationServerKey padding", () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 255]);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    const b64url = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(Array.from(urlBase64ToUint8Array(b64url))).toEqual(
      Array.from(bytes),
    );
  });
});
