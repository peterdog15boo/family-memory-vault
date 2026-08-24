import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  resolveAnnouncementCtaUrl,
  sendProductAnnouncement,
} from "@/lib/email/announcements";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

/**
 * POST /api/admin/announcements
 * Body: { featureName, featureSummary, featureCtaUrl, dryRun? }
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  featureName: z.string().trim().min(1).max(120),
  featureSummary: z.string().trim().min(1).max(2000),
  featureCtaUrl: z.string().trim().min(1).max(500),
  dryRun: z.boolean().optional(),
  limit: z.number().int().min(1).max(2000).optional(),
});

export async function POST(request: Request) {
  const originBlock = rejectUntrustedOrigin(request);
  if (originBlock) return originBlock;

  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }
  const actorId = authResult.userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!resolveAnnouncementCtaUrl(parsed.data.featureCtaUrl)) {
    return NextResponse.json(
      {
        error:
          "CTA must be an app path (e.g. /movies) or an absolute URL on this site.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await sendProductAnnouncement({
      actorId,
      dryRun: parsed.data.dryRun,
      limit: parsed.data.limit,
      announcement: {
        featureName: parsed.data.featureName,
        featureSummary: parsed.data.featureSummary,
        featureCtaUrl: parsed.data.featureCtaUrl,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[api.admin.announcements] failed", error);
    return NextResponse.json(
      { error: "Announcement send failed." },
      { status: 500 },
    );
  }
}
