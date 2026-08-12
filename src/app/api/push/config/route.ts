import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import { getWebPushVapid } from "@/lib/push/vapid";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const vapid = getWebPushVapid();
    if (!vapid) {
      return NextResponse.json({ configured: false, publicKey: null });
    }
    return NextResponse.json({
      configured: true,
      publicKey: vapid.publicKey,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load push config");
  }
}
