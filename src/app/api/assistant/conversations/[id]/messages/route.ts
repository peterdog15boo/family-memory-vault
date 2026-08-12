import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import { getConversationForUser } from "@/lib/assistant/conversations";
import { handleAssistantTurn, proposeCreateFromSearchResults } from "@/lib/ai/assistant";
import type { AssistantIntent } from "@/lib/assistant/types";
import {
  assistantApiErrorResponse,
  toAssistantTurnApiPayload,
} from "@/lib/ai/http";
import { ensureAppUser } from "@/lib/users";
import { getLocale } from "@/lib/i18n/server";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    message: z.string().trim().min(1).max(4000).optional(),
    /** Create a memory preview from prior search result media IDs. */
    createMemoryFromMediaIds: z
      .array(z.string().trim().min(1).max(128))
      .min(1)
      .max(48)
      .optional(),
    /** Create a movie preview from prior search result media IDs. */
    createMovieFromMediaIds: z
      .array(z.string().trim().min(1).max(128))
      .min(1)
      .max(48)
      .optional(),
    /** Optional prior search intent for a better working title. */
    seedIntent: z
      .object({
        action: z.enum([
          "create_memory",
          "create_movie",
          "search_media",
          "clarify",
        ]),
        people: z.array(z.string()).optional(),
        date_range: z
          .object({
            start: z.string().optional(),
            end: z.string().optional(),
            label: z.string().optional(),
          })
          .optional(),
        tone: z.string().optional(),
        qualities: z.array(z.string()).optional(),
        visual_query: z.string().optional(),
        objects: z.array(z.string()).optional(),
        scenes: z.array(z.string()).optional(),
        theme_preference: z.string().optional(),
        title_suggestion: z.string().optional(),
        raw_prompt: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (data) =>
      Boolean(data.message?.trim()) ||
      Boolean(data.createMemoryFromMediaIds?.length) ||
      Boolean(data.createMovieFromMediaIds?.length),
    { message: "Provide message, createMemoryFromMediaIds, or createMovieFromMediaIds" },
  );

/**
 * POST /api/assistant/conversations/[id]/messages
 * Send a user message and run the assistant orchestration pipeline.
 *
 * Creates always preview + confirm in the UI (no auto-execute on this API).
 * Optional: createMemoryFromMediaIds / createMovieFromMediaIds turn search hits into a preview.
 */
export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id: conversationId } = await context.params;
  if (!conversationId?.trim()) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid message request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    const locale = await getLocale();
    const conversation = await getConversationForUser(conversationId, userId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const fromSearchIds =
      parsed.data.createMovieFromMediaIds ?? parsed.data.createMemoryFromMediaIds;
    if (fromSearchIds?.length) {
      const seed = parsed.data.seedIntent;
      const seedIntent: AssistantIntent | null = seed
        ? {
            action: "search_media",
            people: seed.people ?? [],
            date_range: seed.date_range,
            tone: seed.tone as AssistantIntent["tone"],
            qualities: seed.qualities,
            visual_query: seed.visual_query,
            objects: seed.objects,
            scenes: seed.scenes,
            theme_preference: seed.theme_preference,
            title_suggestion: seed.title_suggestion,
            raw_prompt: seed.raw_prompt ?? "search results",
          }
        : null;

      const turn = await proposeCreateFromSearchResults({
        userId,
        conversationId,
        mediaIds: fromSearchIds,
        seedIntent,
        createAction: parsed.data.createMovieFromMediaIds?.length
          ? "create_movie"
          : "create_memory",
        locale,
      });

      return NextResponse.json({
        turn: toAssistantTurnApiPayload(turn, locale),
      });
    }

    const turn = await handleAssistantTurn({
      userId,
      conversationId,
      message: parsed.data.message!,
      autoExecuteCreates: false,
      locale,
    });

    return NextResponse.json({
      turn: toAssistantTurnApiPayload(turn, locale),
    });
  } catch (error) {
    return assistantApiErrorResponse(error, "Assistant request failed");
  }
}
