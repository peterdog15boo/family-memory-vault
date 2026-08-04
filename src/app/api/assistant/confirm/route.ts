import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import { getConversationForUser } from "@/lib/assistant/conversations";
import {
  cancelAssistantProposal,
  confirmAssistantProposal,
} from "@/lib/ai/assistant";
import {
  assistantApiErrorResponse,
  toAssistantTurnApiPayload,
} from "@/lib/ai/http";
import { ensureAppUser } from "@/lib/users";

const bodySchema = z.object({
  conversationId: z.string().trim().min(1).max(128),
  proposalId: z.string().trim().min(1).max(128),
  /** When true, cancel the pending preview instead of confirming. */
  cancel: z.boolean().optional(),
  /** Optional curated subset of proposal media (mismatches removed in UI). */
  mediaIds: z
    .array(z.string().trim().min(1).max(128))
    .min(1)
    .max(48)
    .optional(),
});

/**
 * POST /api/assistant/confirm
 * Confirm (or cancel) a pending create memory/movie proposal.
 *
 * Body: { conversationId, proposalId, cancel?: boolean, mediaIds?: string[] }
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Provide conversationId and proposalId",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    const conversation = await getConversationForUser(
      parsed.data.conversationId,
      userId,
    );
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const turn = parsed.data.cancel
      ? await cancelAssistantProposal({
          userId,
          conversationId: parsed.data.conversationId,
          proposalId: parsed.data.proposalId,
        })
      : await confirmAssistantProposal({
          userId,
          conversationId: parsed.data.conversationId,
          proposalId: parsed.data.proposalId,
          mediaIds: parsed.data.mediaIds,
        });

    return NextResponse.json({
      turn: toAssistantTurnApiPayload(turn),
    });
  } catch (error) {
    return assistantApiErrorResponse(error, "Failed to confirm assistant action");
  }
}
