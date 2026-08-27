import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdminAudit } from "@/lib/admin/audit";
import { getAdminFeedbackSubmission } from "@/lib/admin/feedback";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  feedbackTesterReplyEmail,
  isEmailConfigured,
  sendEmail,
} from "@/lib/email";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const postSchema = z.object({
  id: z.string().trim().min(1),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8_000),
});

/**
 * POST /api/admin/feedback/email — send a thank-you reply to the ticket reporter.
 * Admin-only. Uses the email stored on the feedback submission.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const row = await getAdminFeedbackSubmission(parsed.data.id);
    if (!row) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const to = row.email?.trim();
    if (!to) {
      return NextResponse.json(
        { error: "This ticket has no reporter email on file" },
        { status: 400 },
      );
    }

    const content = feedbackTesterReplyEmail({
      subject: parsed.data.subject,
      body: parsed.data.body,
      ticketId: row.ticketId,
    });

    const result = await sendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      tags: [
        { name: "category", value: "feedback_reply" },
        { name: "ticket", value: row.ticketId.slice(0, 64) },
      ],
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to send email" },
        { status: 502 },
      );
    }

    await logAdminAudit({
      actorId: authResult.userId,
      action: "feedback.email_reply",
      targetType: "feedback_submission",
      targetId: row.id,
      metadata: {
        ticketId: row.ticketId,
        mode: row.mode,
        to,
        subject: content.subject,
        messageId: result.id ?? null,
        loggedOnly: Boolean(result.logged),
        emailConfigured: isEmailConfigured(),
      },
    });

    return NextResponse.json({
      ok: true,
      id: row.id,
      ticketId: row.ticketId,
      to,
      messageId: result.id ?? null,
      logged: Boolean(result.logged),
    });
  } catch (error) {
    console.error("[api.admin.feedback.email] send failed", error);
    return NextResponse.json(
      { error: "Failed to send feedback reply" },
      { status: 500 },
    );
  }
}
