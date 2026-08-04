import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  createConversation,
  listConversationsForUser,
} from "@/lib/assistant/conversations";
import {
  assistantApiErrorResponse,
  serializeConversation,
} from "@/lib/ai/http";
import { ensureAppUser } from "@/lib/users";

const createBodySchema = z.object({
  title: z.string().trim().min(1).max(200).nullable().optional(),
});

/**
 * GET /api/assistant/conversations — list the current user's threads.
 */
export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50),
    100,
  );

  try {
    await ensureAppUser(userId);
    const conversations = await listConversationsForUser(userId, { limit });
    return NextResponse.json({
      conversations: conversations.map(serializeConversation),
    });
  } catch (error) {
    return assistantApiErrorResponse(error, "Failed to list conversations");
  }
}

/**
 * POST /api/assistant/conversations — start a new conversation.
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    const conversation = await createConversation({
      userId,
      title: parsed.data.title ?? null,
    });
    return NextResponse.json(
      { conversation: serializeConversation(conversation) },
      { status: 201 },
    );
  } catch (error) {
    return assistantApiErrorResponse(error, "Failed to create conversation");
  }
}
