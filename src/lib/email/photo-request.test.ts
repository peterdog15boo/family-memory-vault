/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
}));

import {
  PHOTO_REQUEST_EMAIL_COOLDOWN_MS,
  notifyThenEmailPhotoRequest,
  recipientEmailForPhotoRequest,
  sendPhotoRequestEmail,
  sendPhotoRequestFollowUpEmail,
  shouldSendPhotoRequestEmail,
} from "@/lib/email/photo-request";

describe("photo request email", () => {
  beforeEach(() => {
    sendEmail.mockClear();
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
      tags?: Array<{ name: string; value: string }>;
    };
    expect(payload.to).toBe("pat@example.com");
    expect(payload.tags).toEqual([{ name: "template", value: "photo_request" }]);
  });

  it("skips email when the accepted member has no account email", () => {
    expect(
      recipientEmailForPhotoRequest({
        hasAccount: true,
        accountEmail: null,
        invitedEmail: "invite-only@example.com",
      }),
    ).toBeNull();
  });

  it("second request inside 24h does not send another email", async () => {
    expect(PHOTO_REQUEST_EMAIL_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
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
    expect(result).toEqual({ sent: false, skipped: "already_sent" });
    expect(sendEmail).not.toHaveBeenCalled();
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
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("missing account email skips send (notification-only)", async () => {
    const send = vi.fn();
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
    expect(result).toEqual({ sent: false, skipped: "no_email" });
    expect(send).not.toHaveBeenCalled();
  });

  it("creates an in-app notification and sends one email", async () => {
    const notify = vi.fn(async () => ({ id: "notif_1" }));
    const email = vi.fn(async () => ({ sent: true, skipped: null }));
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
    });
  });
});
