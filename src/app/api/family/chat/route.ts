import { NextResponse } from "next/server";
import { FamilyChatError, getChatBootstrapForUser } from "@/lib/family-chat";
import { requireFamilyApiUser } from "@/lib/families/http";
import { apiErrorFromUnknown } from "@/lib/http/api-error";

/**
 * GET /api/family/chat?familyId=
 * Returns eligible families + access for the selected (or preferred) family.
 */
export async function GET(request: Request) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const url = new URL(request.url);
  const familyId = url.searchParams.get("familyId");

  try {
    const bootstrap = await getChatBootstrapForUser(
      authResult.userId,
      familyId,
    );
    return NextResponse.json(bootstrap);
  } catch (error) {
    if (error instanceof FamilyChatError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status:
            error.code === "forbidden" || error.code === "excluded" ? 403 : 400,
        },
      );
    }
    return apiErrorFromUnknown(error, "Failed to load family chat");
  }
}
