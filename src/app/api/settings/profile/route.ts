import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import { getLiveProfile } from "@/lib/profile";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

/**
 * GET /api/settings/profile
 * Live profile Settings + Ava share (users.displayName / users.imageUrl).
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    await ensureAppUser(authResult.userId);
    const profile = await getLiveProfile(authResult.userId);
    console.info("[settings.profile.read]", {
      userId: authResult.userId,
      displayName: profile.displayName,
      imageUrl: profile.imageUrl
        ? `${profile.imageUrl.slice(0, 64)}…`
        : null,
    });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load profile");
  }
}
