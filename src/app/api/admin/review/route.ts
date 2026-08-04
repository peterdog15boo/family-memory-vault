import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  applyHumanReviewDecision,
  listMediaNeedingHumanReview,
} from "@/lib/moderation/review";

/**
 * Admin human-review API.
 *
 * GET  — list items with moderation_status = needs_human_review
 * POST — apply a reviewer decision
 */

export const runtime = "nodejs";

const actionSchema = z.object({
  mediaId: z.string().min(1),
  action: z.enum(["clean", "adult", "csam_quarantined", "rejected"]),
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  try {
    const items = await listMediaNeedingHumanReview(authResult.userId);
    return NextResponse.json({
      ok: true,
      count: items.length,
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[api.admin.review] list failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list review queue",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const media = await applyHumanReviewDecision({
      mediaId: parsed.data.mediaId,
      actorUserId: authResult.userId,
      action: parsed.data.action,
      notes: parsed.data.notes,
    });

    return NextResponse.json({
      ok: true,
      mediaId: media.id,
      moderationStatus: media.moderationStatus,
      status: media.status,
      originalKey: media.originalKey,
    });
  } catch (error) {
    console.error("[api.admin.review] action failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to apply review decision",
      },
      { status: 500 },
    );
  }
}
