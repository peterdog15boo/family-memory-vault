import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createChatThread,
  FamilyChatError,
  listChatThreads,
} from "@/lib/family-chat";
import { requireFamilyApiUser } from "@/lib/families/http";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

const createSchema = z.object({
  familyId: z.string().trim().min(1),
  participantUserIds: z.array(z.string().trim().min(1)).min(1).max(50),
});

function chatErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof FamilyChatError) {
    const status =
      error.code === "forbidden" || error.code === "excluded"
        ? 403
        : error.code === "not_found"
          ? 404
          : 400;
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status },
    );
  }
  return apiErrorFromUnknown(error, fallback);
}

/**
 * GET /api/family/chat/threads?familyId=
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
    const threads = await listChatThreads({
      familyId,
      userId: authResult.userId,
    });
    return NextResponse.json({ threads });
  } catch (error) {
    return chatErrorResponse(error, "Failed to load chats");
  }
}

/**
 * POST /api/family/chat/threads — start a chat with selected recipients.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const limited = enforceRateLimit(
    `family-chat-send:${authResult.userId}`,
    RATE_LIMITS.familyChatSend.limit,
    RATE_LIMITS.familyChatSend.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Select at least one recipient", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const thread = await createChatThread({
      familyId: parsed.data.familyId,
      creatorUserId: authResult.userId,
      participantUserIds: parsed.data.participantUserIds,
    });
    return NextResponse.json({ thread });
  } catch (error) {
    return chatErrorResponse(error, "Failed to create chat");
  }
}
