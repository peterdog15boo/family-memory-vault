import { NextResponse } from "next/server";
import { z } from "zod";
import { FamilyChatError, markChatRead } from "@/lib/family-chat";
import { requireFamilyApiUser } from "@/lib/families/http";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

const readSchema = z.object({
  threadId: z.string().trim().min(1),
});

/**
 * POST /api/family/chat/read — mark a thread as read for the current user.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const limited = enforceRateLimit(
    `family-chat-read:${authResult.userId}`,
    RATE_LIMITS.familyChatRead.limit,
    RATE_LIMITS.familyChatRead.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = readSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  try {
    await markChatRead({
      threadId: parsed.data.threadId,
      userId: authResult.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FamilyChatError) {
      const status =
        error.code === "forbidden" || error.code === "excluded" ? 403 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    return apiErrorFromUnknown(error, "Failed to mark chat read");
  }
}
