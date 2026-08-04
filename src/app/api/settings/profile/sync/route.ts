import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { syncProfileFromClerk } from "@/lib/profile";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

/**
 * POST /api/settings/profile/sync
 * Pull the latest Clerk profile into the app users table after client-side updates.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    await ensureAppUser(authResult.userId);
    const profile = await syncProfileFromClerk(authResult.userId);
    console.info("[settings.profile.sync]", {
      userId: authResult.userId,
      displayName: profile.displayName,
      imageUrl: profile.imageUrl
        ? `${profile.imageUrl.slice(0, 64)}…`
        : null,
    });
    return NextResponse.json({
      ok: true,
      profile: {
        email: profile.email,
        displayName: profile.displayName,
        imageUrl: profile.imageUrl,
      },
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to sync profile");
  }
}
