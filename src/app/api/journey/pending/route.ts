import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  getPendingJourneyCelebration,
  markJourneyCelebrationShown,
} from "@/lib/gamification/pending";

/**
 * GET /api/journey/pending — next unshown photo or memory milestone celebration.
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const pending = await getPendingJourneyCelebration(authResult.userId);
  return NextResponse.json({ pending });
}

const bodySchema = z.object({
  notificationId: z.string().min(1),
});

/**
 * POST /api/journey/pending — mark a celebration as shown.
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ok = await markJourneyCelebrationShown(
    authResult.userId,
    parsed.data.notificationId,
  );
  return NextResponse.json({ ok });
}
