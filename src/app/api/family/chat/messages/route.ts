import { NextResponse } from "next/server";
import { z } from "zod";
import {
  FAMILY_CHAT_MAX_BODY_LENGTH,
  FamilyChatError,
  listChatMessages,
  sendChatMessage,
} from "@/lib/family-chat";
import { requireFamilyApiUser } from "@/lib/families/http";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

const sendSchema = z.object({
  threadId: z.string().trim().min(1),
  body: z.string().min(1).max(FAMILY_CHAT_MAX_BODY_LENGTH + 50),
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
 * GET /api/family/chat/messages?threadId=&before=&limit=
 */
export async function GET(request: Request) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const url = new URL(request.url);
  const threadId = url.searchParams.get("threadId")?.trim();
  if (!threadId) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  const before = url.searchParams.get("before");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  try {
    const messages = await listChatMessages({
      threadId,
      userId: authResult.userId,
      before,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({ messages });
  } catch (error) {
    return chatErrorResponse(error, "Failed to load messages");
  }
}

/**
 * POST /api/family/chat/messages — send a text message in a thread.
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

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid message", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const message = await sendChatMessage({
      threadId: parsed.data.threadId,
      userId: authResult.userId,
      body: parsed.data.body,
    });
    return NextResponse.json({ message });
  } catch (error) {
    return chatErrorResponse(error, "Failed to send message");
  }
}
