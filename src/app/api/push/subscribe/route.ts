import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { ensureAppUser } from "@/lib/users";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  deletePushSubscriptionByEndpoint,
  upsertPushSubscription,
} from "@/lib/push/subscriptions";
import { isWebPushConfigured } from "@/lib/push/vapid";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256),
  }),
  userAgent: z.string().max(512).optional().nullable(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  if (!isWebPushConfigured()) {
    return apiError("Web Push is not configured", {
      status: 503,
      code: "push_not_configured",
    });
  }

  const limited = enforceRateLimit(
    `push-subscribe:${authResult.userId}`,
    RATE_LIMITS.pushSubscribe.limit,
    RATE_LIMITS.pushSubscribe.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid subscription", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    await ensureAppUser(authResult.userId);
    await upsertPushSubscription({
      userId: authResult.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: parsed.data.userAgent,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to save push subscription");
  }
}

export async function DELETE(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const limited = enforceRateLimit(
    `push-unsubscribe:${authResult.userId}`,
    RATE_LIMITS.pushSubscribe.limit,
    RATE_LIMITS.pushSubscribe.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid subscription", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    await deletePushSubscriptionByEndpoint(
      authResult.userId,
      parsed.data.endpoint,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to remove push subscription");
  }
}
