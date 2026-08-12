import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdminAudit } from "@/lib/admin/audit";
import {
  feedbackSubmissionStatusSchema,
  isFeedbackMode,
  listAdminFeedbackSubmissions,
  updateFeedbackSubmissionStatus,
} from "@/lib/admin/feedback";
import { requireAdminApi } from "@/lib/auth/admin";
import { FEEDBACK_SUBMISSION_STATUSES } from "@/lib/db/schema";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";

const patchSchema = z.object({
  id: z.string().trim().min(1),
  status: feedbackSubmissionStatusSchema,
});

/**
 * GET /api/admin/feedback — list beta feedback submissions.
 */
export async function GET(request: Request) {
  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "all";
  const modeParam = url.searchParams.get("mode") ?? "all";

  const status =
    statusParam === "all"
      ? "all"
      : FEEDBACK_SUBMISSION_STATUSES.includes(
            statusParam as (typeof FEEDBACK_SUBMISSION_STATUSES)[number],
          )
        ? (statusParam as (typeof FEEDBACK_SUBMISSION_STATUSES)[number])
        : null;
  const mode =
    modeParam === "all"
      ? "all"
      : isFeedbackMode(modeParam)
        ? modeParam
        : null;

  if (!status || !mode) {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }

  try {
    const items = await listAdminFeedbackSubmissions({
      status,
      mode,
      limit: 100,
    });
    return NextResponse.json({
      ok: true,
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        clientTimestamp: item.clientTimestamp?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("[api.admin.feedback] list failed", error);
    return NextResponse.json(
      { error: "Failed to load feedback" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/feedback — update triage status.
 */
export async function PATCH(request: Request) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const row = await updateFeedbackSubmissionStatus({
      id: parsed.data.id,
      status: parsed.data.status,
    });
    if (!row) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    await logAdminAudit({
      actorId: authResult.userId,
      action: "feedback.status_update",
      targetType: "feedback_submission",
      targetId: row.id,
      metadata: {
        ticketId: row.ticketId,
        status: row.status,
        mode: row.mode,
      },
    });

    return NextResponse.json({
      ok: true,
      id: row.id,
      ticketId: row.ticketId,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("[api.admin.feedback] patch failed", error);
    return NextResponse.json(
      { error: "Failed to update feedback status" },
      { status: 500 },
    );
  }
}
