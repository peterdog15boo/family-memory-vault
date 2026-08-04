import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  getConversationForUser,
  listMessages,
} from "@/lib/assistant/conversations";
import {
  assistantApiErrorResponse,
  serializeConversation,
  serializeMessage,
} from "@/lib/ai/http";
import { ensureAppUser } from "@/lib/users";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/assistant/conversations/[id] — conversation + messages for the owner.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  try {
    await ensureAppUser(userId);
    const conversation = await getConversationForUser(id, userId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const messages = await listMessages(id, userId);
    return NextResponse.json({
      conversation: serializeConversation(conversation),
      messages: messages.map(serializeMessage),
    });
  } catch (error) {
    return assistantApiErrorResponse(error, "Failed to load conversation");
  }
}
