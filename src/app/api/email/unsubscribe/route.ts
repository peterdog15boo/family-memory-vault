import { NextResponse } from "next/server";
import { unsubscribeRetentionEmail } from "@/lib/retention/email";
import { verifyRetentionUnsubscribeToken } from "@/lib/retention/unsubscribe";
import { getAppUrl } from "@/lib/env";

export const runtime = "nodejs";

/**
 * GET /api/email/unsubscribe?token=…
 * Signed, no-login unsubscribe for weekly retention ideas.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim() ?? "";
  const verified = verifyRetentionUnsubscribeToken(token);

  if (!verified) {
    return NextResponse.redirect(
      `${getAppUrl()}/settings?email=unsubscribe_invalid`,
    );
  }

  try {
    await unsubscribeRetentionEmail(verified.userId);
  } catch (err) {
    console.error("[api.email.unsubscribe] failed", err);
    return NextResponse.redirect(
      `${getAppUrl()}/settings?email=unsubscribe_error`,
    );
  }

  return NextResponse.redirect(
    `${getAppUrl()}/settings?email=unsubscribed`,
  );
}
