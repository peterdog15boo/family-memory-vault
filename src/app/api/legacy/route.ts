import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import { ensureAppUser } from "@/lib/users";

/**
 * GET /api/legacy — full owner vault + progress checklist.
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  try {
    await ensureAppUser(userId);
    const vault = await loadLegacyVault(userId);
    return NextResponse.json(vault);
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load digital legacy");
  }
}
