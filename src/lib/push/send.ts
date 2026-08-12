/**
 * Server-only Web Push sender. Do not import from client components —
 * `web-push` requires Node `net` / `http`.
 */
import {
  deletePushSubscriptionByEndpointOnly,
  listPushSubscriptionsForUser,
} from "@/lib/push/subscriptions";
import { getWebPushVapid } from "@/lib/push/vapid";

export type WebPushPayload = {
  userId: string;
  title: string;
  body: string;
  href: string;
  tag?: string;
};

export function isGonePushStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410 || statusCode === 403;
}

type WebPushModule = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
    payload: string,
    options?: { TTL?: number; urgency?: string },
  ) => Promise<unknown>;
};

async function loadWebPush(): Promise<WebPushModule | null> {
  const vapid = getWebPushVapid();
  if (!vapid) return null;

  const mod = (await import("web-push")) as {
    default?: WebPushModule;
  } & WebPushModule;
  const webpush = mod.default ?? mod;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return webpush;
}

function statusFromError(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const rec = error as { statusCode?: unknown; status?: unknown };
  if (typeof rec.statusCode === "number") return rec.statusCode;
  if (typeof rec.status === "number") return rec.status;
  return undefined;
}

export async function sendWebPushToUser(
  input: WebPushPayload,
): Promise<{ sent: number; skipped: string | null }> {
  const webpush = await loadWebPush();
  if (!webpush) {
    return { sent: 0, skipped: "web_push_not_configured" };
  }

  const rows = await listPushSubscriptionsForUser(input.userId);
  if (rows.length === 0) {
    return { sent: 0, skipped: "no_subscriptions" };
  }

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    href: input.href.startsWith("/") ? input.href : `/${input.href}`,
    tag: input.tag ?? "fmv",
  });

  let sent = 0;
  for (const row of rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload,
        { TTL: 60 * 60 * 12, urgency: "normal" },
      );
      sent += 1;
    } catch (error) {
      const status = statusFromError(error);
      if (isGonePushStatus(status)) {
        await deletePushSubscriptionByEndpointOnly(row.endpoint);
        continue;
      }
      console.error("[push.send] delivery failed", {
        userId: input.userId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { sent, skipped: sent === 0 ? "all_failed" : null };
}
