/**
 * Web Push for major milestones. No-op when VAPID keys or subscriptions are missing.
 */

import { sendWebPushToUser } from "@/lib/push/send";

export async function queueWebPushIfConfigured(input: {
  userId: string;
  title: string;
  body: string;
  href: string;
}): Promise<{ queued: boolean; skipped: string | null }> {
  const result = await sendWebPushToUser({
    userId: input.userId,
    title: input.title,
    body: input.body,
    href: input.href,
    tag: "fmv-milestone",
  });
  return {
    queued: result.sent > 0,
    skipped: result.skipped,
  };
}
