/**
 * Execute a resolved assistant intent after media retrieval.
 *
 * Supported actions:
 * - search_media  → summary + preview thumbnails (no writes beyond action log)
 * - create_memory → album from clean matching media
 * - create_movie  → memory (create or reuse) + movie render job
 * - clarify       → return clarifying questions (no media writes)
 *
 * Rules:
 * - Never attach non-clean media (createMemory / addMediaToMemory already gate this)
 * - Refuse empty / too-sparse creates instead of silent empty memories
 * - Persist assistant_actions (+ message metadata) for the conversation
 */

import { after } from "next/server";
import {
  addMessage,
  logAssistantAction,
  mergeMessageMetadata,
  updateAssistantAction,
  updateConversationTitle,
} from "@/lib/assistant/conversations";
import type {
  AssistantActionResult,
  AssistantActionStatus,
  AssistantIntent,
} from "@/lib/assistant/types";
import {
  explainSparseMediaResults,
  type AssistantMediaQueryResult,
  type MediaQueryExplanation,
} from "@/lib/ai/media-query";
import { formatMediaTypeCounts } from "@/lib/ai/media-preference";
import type { ResolvedIntent } from "@/lib/ai/resolve";
import {
  buildEmotionalDescription,
  buildEmotionalTitle,
  chooseEmotionalMovieStyle,
  detectEmotionalKind,
  emotionalStyleFallback,
  resolveEmotionalMovieTreatment,
  type EmotionalToneKind,
} from "@/lib/ai/emotional-treatment";
import {
  publicAssistantErrorMessage,
} from "@/lib/ai/safety";
import { executePrivateVaultIntent } from "@/lib/ai/private-vault";
import { answerProductHelp, formatSecondaryHelpTip } from "@/lib/ai/help";
import type { MovieStyle } from "@/lib/db/schema";
import { createMemory, addMediaToMemory } from "@/lib/memories";
import { createMovieJob } from "@/lib/movies/lifecycle";
import {
  ensureFaceAwareMovieSettings,
  faceAwareMovieMotionDefaults,
} from "@/lib/movies/settings";
import {
  logAssistantActionEvent,
  logAssistantFailed,
} from "@/lib/observability/events";
import { ADVANCED_MOVIE_THEMES, canUseAdvancedTheme } from "@/lib/plans/gates";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/** Refuse memory create below this many clean matches. */
export const MIN_MEDIA_FOR_MEMORY = 1;
/** Slideshows need a few frames — refuse thinner sets. */
export const MIN_MEDIA_FOR_MOVIE = 3;

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export type ExecuteAssistantActionInput = {
  userId: string;
  conversationId: string;
  /** User or assistant message that triggered execution (for metadata link). */
  messageId?: string | null;
  intent: AssistantIntent;
  resolved: ResolvedIntent;
  media: AssistantMediaQueryResult;
  /**
   * Optional existing memory to attach media to / render from (create_movie).
   * Must belong to the user — ownership enforced by createMovieJob / addMedia.
   */
  reuseMemoryId?: string | null;
  minMediaForMemory?: number;
  minMediaForMovie?: number;
  /** Persist an assistant reply message summarizing the outcome (default true). */
  writeAssistantReply?: boolean;
};

export type ExecuteAssistantActionOutcome = {
  actionId: string;
  status: AssistantActionStatus;
  result: AssistantActionResult;
  assistantMessage: string;
  /** Theme used for create_movie (after plan gating). */
  movieStyle?: MovieStyle;
  explanation?: MediaQueryExplanation;
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function executeAssistantAction(
  input: ExecuteAssistantActionInput,
): Promise<ExecuteAssistantActionOutcome> {
  const actionType =
    input.resolved.needsClarification || input.intent.action === "clarify"
      ? "clarify"
      : input.intent.action;

  let pending: Awaited<ReturnType<typeof logAssistantAction>>;
  try {
    pending = await logAssistantAction({
      conversationId: input.conversationId,
      userId: input.userId,
      messageId: input.messageId,
      actionType,
      status: "pending",
      intent: input.intent,
    });
  } catch (error) {
    // Product help should still answer if the DB enum hasn't been migrated yet.
    if (actionType === "answer_help" && isUnknownActionTypeEnumError(error)) {
      const outcome = await executeAnswerHelp(input);
      return { ...outcome, actionId: "help-unlogged" };
    }
    throw error;
  }

  if (input.messageId) {
    await mergeMessageMetadata(input.messageId, input.userId, {
      intent: input.intent,
      actionIds: [pending.id],
      mediaIds: input.media.items.map((item) => item.id),
    });
  }

  try {
    const outcome = await dispatchAction(actionType, input, pending.id);

    await updateAssistantAction({
      actionId: pending.id,
      userId: input.userId,
      status: outcome.status,
      result: outcome.result,
      error:
        outcome.result.type === "error" ? outcome.result.message : null,
    });

    logAssistantActionEvent({
      userId: input.userId,
      conversationId: input.conversationId,
      actionId: pending.id,
      actionType,
      status: outcome.status,
      resultType: outcome.result.type,
      mediaCount: input.media.items.length,
      memoryId:
        outcome.result.type === "create_memory" ||
        outcome.result.type === "create_movie"
          ? outcome.result.memoryId
          : undefined,
      movieId:
        outcome.result.type === "create_movie"
          ? outcome.result.movieId
          : undefined,
    });

    if (input.writeAssistantReply !== false) {
      await addMessage({
        conversationId: input.conversationId,
        userId: input.userId,
        role: "assistant",
        content: outcome.assistantMessage,
        metadata: {
          intent: input.intent,
          actionIds: [pending.id],
          mediaIds:
            outcome.result.type === "search_media"
              ? outcome.result.mediaIds
              : outcome.result.type === "create_memory"
                ? outcome.result.mediaIds
                : input.media.items.map((item) => item.id),
        },
      });
    }

    // Seed conversation title from a successful create.
    if (
      outcome.status === "succeeded" &&
      (outcome.result.type === "create_memory" ||
        outcome.result.type === "create_movie") &&
      outcome.result.title
    ) {
      await updateConversationTitle(
        input.conversationId,
        input.userId,
        outcome.result.title,
      ).catch(() => undefined);
    }

    return { ...outcome, actionId: pending.id };
  } catch (error) {
    const safeMessage = publicAssistantErrorMessage(error);
    const result: AssistantActionResult = {
      type: "error",
      message: safeMessage,
      code: "execution_failed",
    };

    logAssistantFailed(
      {
        userId: input.userId,
        conversationId: input.conversationId,
        actionId: pending.id,
        actionType,
      },
      error,
    );

    await updateAssistantAction({
      actionId: pending.id,
      userId: input.userId,
      status: "failed",
      result,
      error: error instanceof Error ? error.message : "Assistant action failed.",
    });

    const assistantMessage = `I couldn't complete that request. ${safeMessage}`;
    if (input.writeAssistantReply !== false) {
      await addMessage({
        conversationId: input.conversationId,
        userId: input.userId,
        role: "assistant",
        content: assistantMessage,
        metadata: {
          intent: input.intent,
          actionIds: [pending.id],
          error: safeMessage,
        },
      });
    }

    return {
      actionId: pending.id,
      status: "failed",
      result,
      assistantMessage,
    };
  }
}

function isUnknownActionTypeEnumError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error &&
          "message" in error &&
          typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);
  return (
    /invalid input value for enum/i.test(message) ||
    (/assistant_action_type/i.test(message) && /answer_help/i.test(message))
  );
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                    */
/* -------------------------------------------------------------------------- */

async function dispatchAction(
  actionType: AssistantIntent["action"],
  input: ExecuteAssistantActionInput,
  _actionId: string,
): Promise<Omit<ExecuteAssistantActionOutcome, "actionId">> {
  if (actionType === "clarify" || input.resolved.needsClarification) {
    return executeClarify(input);
  }

  switch (actionType) {
    case "search_media":
      return executeSearch(input);
    case "create_memory":
      return executeCreateMemory(input);
    case "create_movie":
      return executeCreateMovie(input);
    case "answer_help":
      return executeAnswerHelp(input);
    case "create_document_category":
    case "file_private_document":
    case "add_legacy_contact":
    case "draft_legacy_business":
    case "review_legacy_checklist":
      return executePrivateVault(input);
    default:
      return {
        status: "failed",
        result: {
          type: "error",
          message: `Unsupported action: ${actionType}`,
          code: "unsupported_action",
        },
        assistantMessage: "I'm not sure how to do that yet.",
      };
  }
}

async function executePrivateVault(
  input: ExecuteAssistantActionInput,
): Promise<Omit<ExecuteAssistantActionOutcome, "actionId">> {
  const outcome = await executePrivateVaultIntent(input.userId, input.intent);
  return {
    status: "succeeded",
    result: outcome.result,
    assistantMessage: outcome.assistantMessage,
  };
}

function executeClarify(
  input: ExecuteAssistantActionInput,
): Omit<ExecuteAssistantActionOutcome, "actionId"> {
  const questions = uniqueStrings([
    ...(input.resolved.clarifyingQuestions ?? []),
    ...(input.intent.clarifying_questions ?? []),
  ]);
  const list =
    questions.length > 0
      ? questions
      : [
          "Could you clarify who this should focus on, and whether you want a search, a memory album, or a slideshow?",
        ];

  return {
    status: "needs_clarification",
    result: { type: "clarify", questions: list },
    assistantMessage: [
      "I need a bit more detail before I continue:",
      ...list.map((q, i) => `${i + 1}. ${q}`),
    ].join("\n"),
  };
}

async function executeAnswerHelp(
  input: ExecuteAssistantActionInput,
): Promise<Omit<ExecuteAssistantActionOutcome, "actionId">> {
  const answer = await answerProductHelp(input.userId, input.intent.raw_prompt);
  return {
    status: "succeeded",
    result: {
      type: "answer_help",
      topicIds: answer.topicIds,
      links: answer.links,
    },
    assistantMessage: answer.message,
  };
}

function executeSearch(
  input: ExecuteAssistantActionInput,
): Omit<ExecuteAssistantActionOutcome, "actionId"> {
  const { media, resolved, intent } = input;
  const visualLabel =
    intent.visual_query?.trim() ||
    [...(intent.objects ?? []), ...(intent.scenes ?? [])].join(" / ") ||
    null;
  const explanation = explainSparseMediaResults({
    diagnostics: media.diagnostics,
    matchedPeople: resolved.matchedPeople,
    visualQuery: intent.visual_query,
  });

  const mediaIds = media.items.map((item) => item.id);
  const result: AssistantActionResult = {
    type: "search_media",
    mediaIds,
    count: media.totalCount,
  };

  const helpAside = formatSecondaryHelpTip(intent.raw_prompt) ?? "";

  if (media.totalCount === 0) {
    return {
      status: "succeeded",
      result,
      assistantMessage: [
        explanation.summary,
        ...explanation.reasons,
        ...explanation.suggestions.map((s) => `Suggestion: ${s}`),
      ]
        .filter(Boolean)
        .join("\n")
        .concat(helpAside),
      explanation,
    };
  }

  const who = resolved.matchedPeople.map((p) => p.name).join(", ");
  const when = resolved.dateFilter?.label
    ? ` (${resolved.dateFilter.label})`
    : "";
  const previewNote =
    media.sampleThumbnails.length > 0
      ? ` Showing ${media.sampleThumbnails.length} preview(s).`
      : "";

  const lead = visualLabel
    ? `Found ${formatMediaTypeCounts(media.items)} related to ${visualLabel}${who ? ` featuring ${who}` : ""}${when}.`
    : `I found ${formatMediaTypeCounts(media.items)} for ${who || "your library"}${when}.`;

  return {
    status: "succeeded",
    result,
    assistantMessage: `${lead}${previewNote}${helpAside}`,
    explanation,
  };
}

async function executeCreateMemory(
  input: ExecuteAssistantActionInput,
): Promise<Omit<ExecuteAssistantActionOutcome, "actionId">> {
  const min = input.minMediaForMemory ?? MIN_MEDIA_FOR_MEMORY;
  const sparse = refuseIfTooFewMedia(input, min, "memory album");
  if (sparse) return sparse;

  const mediaIds = input.media.items.map((item) => item.id);
  const title = buildMemoryTitle(input.intent, input.resolved);
  const description = buildMemoryDescription(input.intent, input.resolved);

  const memory = await createMemoryFromMediaIds({
    userId: input.userId,
    title,
    description,
    mediaIds,
  });

  return {
    status: "succeeded",
    result: {
      type: "create_memory",
      memoryId: memory.id,
      mediaIds,
      title: memory.title,
    },
    assistantMessage: `Created memory “${memory.title}” with ${mediaIds.length} photo(s).`,
  };
}

async function executeCreateMovie(
  input: ExecuteAssistantActionInput,
): Promise<Omit<ExecuteAssistantActionOutcome, "actionId">> {
  const min = input.minMediaForMovie ?? MIN_MEDIA_FOR_MOVIE;
  const sparse = refuseIfTooFewMedia(input, min, "slideshow / movie");
  if (sparse) return sparse;

  const mediaIds = input.media.items.map((item) => item.id);
  const title = buildMemoryTitle(input.intent, input.resolved);
  const description = buildMemoryDescription(input.intent, input.resolved);
  const treatment = resolveEmotionalMovieTreatment(input.intent);
  const style = await resolveStyleForPlan(
    input.userId,
    treatment.style,
    treatment.kind,
  );
  // If plan forced a fallback style, re-resolve settings for that style.
  const baseSettings =
    style === treatment.style
      ? treatment.settings
      : resolveEmotionalMovieTreatment({
          ...input.intent,
          theme_preference: style,
        }).settings;

  // Ask AI movies share the Memories Create Movie face-aware Ken Burns path.
  // Keep poster/title preferences; never disable face zoom.
  const kind = detectEmotionalKind(input.intent);
  const motionDefaults = faceAwareMovieMotionDefaults();
  const settings = ensureFaceAwareMovieSettings({
    ...baseSettings,
    posterStyle: "photo",
    // Match Memories panel defaults (medium/alternate) unless memorial wants strong.
    zoomIntensity:
      kind === "memorial" && baseSettings.zoomIntensity === "strong"
        ? "strong"
        : motionDefaults.zoomIntensity,
    zoomDirection: motionDefaults.zoomDirection,
    photoDurationMs:
      baseSettings.photoDurationMs ?? motionDefaults.photoDurationMs,
    qualityMode: motionDefaults.qualityMode,
    includeTitles:
      kind === "memorial" ? (baseSettings.includeTitles ?? true) : false,
  });

  let memoryId = input.reuseMemoryId?.trim() || null;

  if (memoryId) {
    for (const mediaId of mediaIds) {
      await addMediaToMemory(memoryId, [mediaId], { userId: input.userId });
    }
  } else {
    const memory = await createMemoryFromMediaIds({
      userId: input.userId,
      title,
      description,
      mediaIds,
    });
    memoryId = memory.id;
  }

  const movie = await createMovieJob({
    memoryId,
    userId: input.userId,
    title,
    style,
    settings,
  });

  // Same as Memories Create Movie: kick a background drain in development so
  // face-aware ffmpeg export completes without a separate worker process.
  if (process.env.NODE_ENV === "development") {
    try {
      after(async () => {
        try {
          const { drainUntilMovieTerminal } = await import("@/workers/movies");
          const result = await drainUntilMovieTerminal(movie.id, { maxJobs: 5 });
          console.info("[assistant.movies] Background drain", {
            movieId: movie.id,
            processed: result.processed.length,
            failures: result.failures.length,
            finalStatus: result.finalStatus,
          });
        } catch (error) {
          console.error(
            "[assistant.movies] Background drain failed",
            movie.id,
            error,
          );
        }
      });
    } catch {
      // `after()` only works inside a Next.js request — ignore in unit tests.
    }
  }

  const doneMessage =
    kind === "memorial"
      ? `I’ve started a cinematic tribute “${movie.title}” from ${mediaIds.length} photo(s). I’ll let you know when it’s ready.`
      : `Started a ${style} movie “${movie.title}” from ${mediaIds.length} photo(s). I’ll notify you when the render is ready.`;

  return {
    status: "succeeded",
    result: {
      type: "create_movie",
      movieId: movie.id,
      memoryId,
      title: movie.title,
    },
    assistantMessage: doneMessage,
    movieStyle: style,
  };
}

/* -------------------------------------------------------------------------- */
/* Memory helpers                                                              */
/* -------------------------------------------------------------------------- */

async function createMemoryFromMediaIds(input: {
  userId: string;
  title: string;
  description: string | null;
  mediaIds: string[];
}): Promise<{ id: string; title: string }> {
  const [coverMediaId, ...rest] = input.mediaIds;
  if (!coverMediaId) {
    throw new Error("Cannot create a memory without clean media.");
  }

  // Create with cover only, then attach remaining IDs in order so slideshow
  // chronology matches the media query (addMediaToMemory batch reorders).
  const memory = await createMemory({
    userId: input.userId,
    title: input.title,
    description: input.description,
    type: "album",
    coverMediaId,
    mediaIds: [],
  });

  for (const mediaId of rest) {
    await addMediaToMemory(memory.id, [mediaId], { userId: input.userId });
  }

  return { id: memory.id, title: memory.title };
}

function refuseIfTooFewMedia(
  input: ExecuteAssistantActionInput,
  min: number,
  label: string,
): Omit<ExecuteAssistantActionOutcome, "actionId"> | null {
  const explanation = explainSparseMediaResults({
    diagnostics: input.media.diagnostics,
    matchedPeople: input.resolved.matchedPeople,
    sparseThreshold: min,
    visualQuery: input.intent.visual_query,
  });

  if (input.media.totalCount >= min && input.media.items.length >= min) {
    return null;
  }

  const questions = [
    `I found ${input.media.totalCount} matching photo(s), but need at least ${min} clean photo(s) to create a ${label}.`,
    ...explanation.suggestions,
  ];

  return {
    status: "needs_clarification",
    result: {
      type: "clarify",
      questions,
    },
    assistantMessage: [
      explanation.summary,
      `I won’t create an empty ${label}.`,
      ...explanation.reasons,
      ...explanation.suggestions.map((s) => `Suggestion: ${s}`),
    ]
      .filter(Boolean)
      .join("\n"),
    explanation,
  };
}

/* -------------------------------------------------------------------------- */
/* Titles / theme                                                              */
/* -------------------------------------------------------------------------- */

/** @see buildEmotionalTitle — emotionally aware titles for memories/movies. */
export function buildMemoryTitle(
  intent: AssistantIntent,
  resolved: ResolvedIntent,
): string {
  return buildEmotionalTitle(intent, resolved);
}

/** @see buildEmotionalDescription */
export function buildMemoryDescription(
  intent: AssistantIntent,
  resolved: ResolvedIntent,
): string | null {
  return buildEmotionalDescription(intent, resolved);
}

/**
 * Map tone / theme_preference → movie style.
 * Memorial / tribute → cinematic; birthday → bright; celebration → holiday.
 */
export function chooseMovieStyle(intent: AssistantIntent): MovieStyle {
  return chooseEmotionalMovieStyle(intent);
}

async function resolveStyleForPlan(
  userId: string,
  preferred: MovieStyle,
  kind: EmotionalToneKind,
): Promise<MovieStyle> {
  if (!(ADVANCED_MOVIE_THEMES as readonly string[]).includes(preferred)) {
    return preferred;
  }

  const gate = await canUseAdvancedTheme(userId, preferred);
  if (gate.allowed) return preferred;

  return emotionalStyleFallback(preferred, kind);
}

/* -------------------------------------------------------------------------- */
/* Small utils                                                                 */
/* -------------------------------------------------------------------------- */

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!out.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      out.push(trimmed);
    }
  }
  return out;
}
