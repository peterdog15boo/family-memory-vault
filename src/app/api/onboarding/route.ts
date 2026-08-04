import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  dismissOnboarding,
  getOnboardingProgress,
  markWelcomeSeen,
} from "@/lib/onboarding";

const bodySchema = z.object({
  action: z.enum(["dismiss", "welcome_seen"]),
});

/**
 * POST /api/onboarding — dismiss checklist or mark welcome step done.
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.action === "dismiss") {
    await dismissOnboarding(userId);
  } else {
    await markWelcomeSeen(userId);
  }

  const progress = await getOnboardingProgress(userId);
  return NextResponse.json({ ok: true, progress });
}

/**
 * GET /api/onboarding — current progress snapshot.
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const progress = await getOnboardingProgress(authResult.userId);
  return NextResponse.json({ progress });
}
