import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getUserJourney } from "@/lib/gamification";

/**
 * GET /api/journey — four-track progress, next milestones, unlocked badges.
 * Always returns the signed-in user's journey (userId in the helper is auth).
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const journey = await getUserJourney(authResult.userId);
  return NextResponse.json({ journey });
}
