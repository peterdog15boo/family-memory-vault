import { NextResponse } from "next/server";
import { resolveChatThreadForUser } from "@/lib/family-chat";
import { requireFamilyApiUser } from "@/lib/families/http";
import { apiErrorFromUnknown } from "@/lib/http/api-error";

type RouteContext = { params: Promise<{ threadId: string }> };

/**
 * GET /api/family/chat/threads/[threadId]
 * Resolve a thread the user can open (notification deep-link).
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const { threadId } = await context.params;
  if (!threadId?.trim()) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  try {
    const resolved = await resolveChatThreadForUser(
      threadId.trim(),
      authResult.userId,
    );
    if (!resolved) {
      return NextResponse.json(
        { error: "Chat not found", code: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ thread: resolved });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to resolve chat");
  }
}
