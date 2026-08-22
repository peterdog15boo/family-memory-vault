import { NextResponse } from "next/server";
import { FamilyChatError, listEligibleChatMembers } from "@/lib/family-chat";
import { requireFamilyApiUser } from "@/lib/families/http";
import { apiErrorFromUnknown } from "@/lib/http/api-error";

/**
 * GET /api/family/chat/eligible?familyId=
 * Chat-eligible family members for the recipient picker (excludes self + opted-out).
 */
export async function GET(request: Request) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const url = new URL(request.url);
  const familyId = url.searchParams.get("familyId")?.trim();
  if (!familyId) {
    return NextResponse.json({ error: "familyId is required" }, { status: 400 });
  }

  try {
    const members = await listEligibleChatMembers({
      familyId,
      userId: authResult.userId,
    });
    return NextResponse.json({ members });
  } catch (error) {
    if (error instanceof FamilyChatError) {
      const status =
        error.code === "forbidden" || error.code === "excluded" ? 403 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    return apiErrorFromUnknown(error, "Failed to load chat members");
  }
}
