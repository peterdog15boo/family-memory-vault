/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { photoRequestEmail } from "@/lib/email/templates";

const sendEmail = vi.hoisted(() =>
  vi.fn(async (input: { to: string | string[]; subject: string }) => ({
    ok: true as const,
    id: "re_test",
    to: input.to,
    subject: input.subject,
  })),
);

vi.mock("@/lib/email", () => ({
  sendEmail,
  isEmailConfigured: () => true,
  getEmailFromAddress: () =>
    "Family Memory Vault <support@mail.familymemoryvault.ai>",
}));

import {
  PHOTO_REQUEST_EMAIL_BETA_COOLDOWN_MS,
  PHOTO_REQUEST_EMAIL_COOLDOWN_MS,
  isFromAddressRejected,
  isPhotoRequestEmailTestMode,
  notifyThenEmailPhotoRequest,
  photoRequestEmailCooldownMs,
  recipientEmailForPhotoRequest,
  redactEmailAddress,
  sendPhotoRequestEmail,
  sendPhotoRequestFollowUpEmail,
  shouldSendPhotoRequestEmail,
} from "@/lib/email/photo-request";

describe("photo request email", () => {
  const envKeys = [
    "NEXT_PUBLIC_BETA_PLAN_SWITCH",
    "NEXT_PUBLIC_BETA_PLAN_PICKER",
    "NEXT_PUBLIC_ENABLE_BETA_FEEDBACK",
  ] as const;
  const envSnapshot = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    sendEmail.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const key of envKeys) {
      const value = envSnapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses the invite layout and does not list other members", () => {
    const content = photoRequestEmail({
      requesterName: "Jeff Roberts",
      requesterFirstName: "Jeff",
      familyName: "The Roberts family",
      note: "Please add the picnic photos",
      ctaUrl: "https://app.example/family",
    });
    expect(content.subject).toBe(
      "Jeff requested photos in Family Memory Vault",
    );
    expect(content.text).toContain("Jeff Roberts");
    expect(content.text).toContain("The Roberts family");
    expect(content.text).toContain("Please add the picnic photos");
    expect(content.text).toContain(
      "You can upload from Photos and share with the family.",
    );
    expect(content.html).toContain("Open Family Memory Vault");
    expect(content.html).toContain("https://app.example/family");
    expect(content.html).not.toContain("other@example.com");
    expect(JSON.stringify(content)).not.toMatch(/re_[A-Za-z0-9]|RESEND_API_KEY/i);
  });

  it("sends via Resend helper with the recipient account email", async () => {
    const result = await sendPhotoRequestEmail({
      to: "pat@example.com",
      requesterName: "Jeff Roberts",
      requesterFirstName: "Jeff",
      familyName: "The Roberts family",
      note: "picnic photos",
      ctaUrl: "https://app.example/family",
    });
    expect(result.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = sendEmail.mock.calls[0]?.[0] as {
      to: string;
      from?: string;
      tags?: Array<{ name: string; value: string }>;
    };
    expect(payload.to).toBe("pat@example.com");
    expect(payload.from).toBeUndefined();
    expect(payload.tags).toEqual([{ name: "template", value: "photo_request" }]);
  });

  it("falls back to invite email when the account has no address", () => {
    expect(
      recipientEmailForPhotoRequest({
        hasAccount: true,
        accountEmail: null,
        invitedEmail: "invite-only@example.com",
      }),
    ).toBe("invite-only@example.com");
  });

  it("skips only when no address exists on file", () => {
    expect(
      recipientEmailForPhotoRequest({
        hasAccount: true,
        accountEmail: null,
        invitedEmail: null,
      }),
    ).toBeNull();
  });

  it("second request inside the cooldown does not send another email", async () => {
    expect(PHOTO_REQUEST_EMAIL_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
    expect(PHOTO_REQUEST_EMAIL_BETA_COOLDOWN_MS).toBe(60 * 1000);
    expect(shouldSendPhotoRequestEmail(1)).toBe(false);
    const result = await sendPhotoRequestFollowUpEmail(
      {
        targetUserId: "user_pat",
        invitedEmail: "pat@example.com",
        alreadySent: true,
        familyName: "The Roberts family",
        requesterName: "Jeff",
        message: "photos please",
        ctaUrl: "https://app.example/family",
      },
      {
        lookupAccountEmail: async () => "pat@example.com",
        send: sendEmail,
      },
    );
    expect(result).toEqual({
      sent: false,
      skipped: "already_sent",
      toRedacted: null,
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("uses a 1 minute cooldown in development or beta", () => {
    const nodeEnv = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PUBLIC_BETA_PLAN_SWITCH;
    delete process.env.NEXT_PUBLIC_BETA_PLAN_PICKER;
    delete process.env.NEXT_PUBLIC_ENABLE_BETA_FEEDBACK;
    expect(isPhotoRequestEmailTestMode()).toBe(false);
    expect(photoRequestEmailCooldownMs()).toBe(PHOTO_REQUEST_EMAIL_COOLDOWN_MS);

    vi.stubEnv("NODE_ENV", "development");
    expect(photoRequestEmailCooldownMs()).toBe(
      PHOTO_REQUEST_EMAIL_BETA_COOLDOWN_MS,
    );

    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_BETA_PLAN_SWITCH = "true";
    expect(photoRequestEmailCooldownMs()).toBe(
      PHOTO_REQUEST_EMAIL_BETA_COOLDOWN_MS,
    );
    vi.stubEnv("NODE_ENV", nodeEnv ?? "test");
  });

  it("notifies path still emails when lookup returns an account address", async () => {
    const send = vi.fn(async (input: { to: string }) => {
      expect(input.to).toBe("pat@example.com");
      return { ok: true, id: "re_1" };
    });
    const result = await sendPhotoRequestFollowUpEmail(
      {
        targetUserId: "user_pat",
        invitedEmail: "stale@example.com",
        alreadySent: false,
        familyName: "The Roberts family",
        requesterName: "Jeff",
        message: "photos please",
        ctaUrl: "https://app.example/family",
      },
      {
        lookupAccountEmail: async () => "pat@example.com",
        send,
      },
    );
    expect(result.sent).toBe(true);
    expect(result.toRedacted).toBe("p***@example.com");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("emails the invite address when the account email is missing", async () => {
    const send = vi.fn(async (input: { to: string }) => {
      expect(input.to).toBe("invite@example.com");
      return { ok: true, id: "re_1" };
    });
    const result = await sendPhotoRequestFollowUpEmail(
      {
        targetUserId: "user_pat",
        invitedEmail: "invite@example.com",
        alreadySent: false,
        familyName: "The Roberts family",
        requesterName: "Jeff",
        message: "photos please",
        ctaUrl: "https://app.example/family",
      },
      {
        lookupAccountEmail: async () => null,
        send,
      },
    );
    expect(result.sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("treats a logged-only send as a missing key skip", async () => {
    const send = vi.fn(async () => ({ ok: true, logged: true }));
    const result = await sendPhotoRequestFollowUpEmail(
      {
        targetUserId: "user_pat",
        invitedEmail: "pat@example.com",
        alreadySent: false,
        familyName: "The Roberts family",
        requesterName: "Jeff",
        message: "photos please",
        ctaUrl: "https://app.example/family",
      },
      {
        lookupAccountEmail: async () => "pat@example.com",
        send,
      },
    );
    expect(result).toEqual({
      sent: false,
      skipped: "missing_key",
      toRedacted: "p***@example.com",
    });
  });

  it("classifies a rejected FROM as from_rejected", async () => {
    expect(isFromAddressRejected("The from address is not verified")).toBe(
      true,
    );
    const send = vi.fn(async () => ({
      ok: false,
      error: "The from address is not verified",
    }));
    const result = await sendPhotoRequestFollowUpEmail(
      {
        targetUserId: "user_pat",
        invitedEmail: "pat@example.com",
        alreadySent: false,
        familyName: "The Roberts family",
        requesterName: "Jeff",
        message: "photos please",
        ctaUrl: "https://app.example/family",
      },
      {
        lookupAccountEmail: async () => "pat@example.com",
        send,
      },
    );
    expect(result.skipped).toBe("from_rejected");
    expect(result.sent).toBe(false);
  });

  it("redacts local-part and never includes secrets", () => {
    expect(redactEmailAddress("pat@example.com")).toBe("p***@example.com");
    expect(JSON.stringify({ email: redactEmailAddress("pat@example.com") })).not.toMatch(
      /re_|RESEND_API_KEY/i,
    );
  });

  it("exposes requester-facing delivery copy", async () => {
    const { createTranslator } = await import("@/lib/i18n");
    const t = createTranslator("en-US");
    expect(t("family.requestPhotosInAppSent")).toBe("Request sent in the app");
    expect(
      t("family.requestPhotosEmailSent", { email: "p***@example.com" }),
    ).toBe("Email sent to p***@example.com");
    expect(
      t("family.requestPhotosEmailNotSent", {
        reason: t("family.requestPhotosEmailReasonAlreadySent"),
      }),
    ).toBe("Email not sent: already emailed today");
  });

  it("creates an in-app notification and sends one email", async () => {
    const notify = vi.fn(async () => ({ id: "notif_1" }));
    const email = vi.fn(async () => ({
      sent: true,
      skipped: null,
      toRedacted: "p***@example.com",
    }));
    const result = await notifyThenEmailPhotoRequest({
      targetUserId: "user_pat",
      notify,
      email,
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      notified: true,
      emailSent: true,
      skipped: null,
      toRedacted: "p***@example.com",
    });
  });
});
