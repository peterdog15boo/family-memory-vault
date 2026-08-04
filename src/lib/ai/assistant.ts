/**
 * Family Memory Vault assistant — main orchestration layer.
 *
 * Per user message:
 *   1. Save the user message
 *   2. Parse intent
 *   3. Resolve people + time
 *   4. Clarify when needed
 *   5. Query matching clean media
 *   6. Preview results (creates) or auto-run safe actions (search)
 *   7. On confirmation / auto-run, execute
 *   8. Save assistant response + entity links
 *   9. Return a UI-friendly payload
 *
 * Supports single-turn requests and multi-turn clarification / confirm flows.
 * Tone: warm, clear, emotionally intelligent — especially for memorials.
 */

import { nanoid } from "nanoid";
import {
  addMessage,
  createConversation,
  getConversationForUser,
  listMessages,
  mergeMessageMetadata,
  updateConversationTitle,
} from "@/lib/assistant/conversations";
import type {
  AssistantActionResult,
  AssistantActionType,
  AssistantIntent,
  AssistantMessageMetadata,
  AssistantPendingProposal,
} from "@/lib/assistant/types";
import {
  buildMemoryTitle,
  chooseMovieStyle,
  executeAssistantAction,
  MIN_MEDIA_FOR_MEMORY,
  MIN_MEDIA_FOR_MOVIE,
} from "@/lib/ai/actions";
import { parseIntent, type ParseIntentOptions } from "@/lib/ai/intent";
import {
  explainSparseMediaResults,
  loadAssistantMediaByIds,
  queryMediaForResolvedIntent,
  type AssistantMediaQueryResult,
  type AssistantMediaThumbnail,
} from "@/lib/ai/media-query";
import { formatMediaTypeCounts } from "@/lib/ai/media-preference";
import {
  resolveIntent,
  type DateFilter,
  type MatchedPerson,
  type ResolvedIntent,
  type UnresolvedPerson,
} from "@/lib/ai/resolve";
import {
  ASSISTANT_CREATE_MEDIA_LIMIT,
  ASSISTANT_SEARCH_SPARSE_THRESHOLD,
  publicAssistantErrorMessage,
  revalidateResolvedPeople,
  shouldClarifyBeforeCreate,
  shouldClarifyBeforeSearch,
} from "@/lib/ai/safety";
import {
  buildPrivateVaultClarifyingQuestions,
  buildPrivateVaultPreviewSummary,
  isPrivateVaultAction,
} from "@/lib/ai/private-vault";
import { formatSecondaryHelpTip } from "@/lib/ai/help";
import {
  logAssistantConfirm,
  logAssistantFailed,
  logAssistantTurn,
} from "@/lib/observability/events";
import { listPeopleForUser } from "@/lib/people";

/* -------------------------------------------------------------------------- */
/* Public types                                                                */
/* -------------------------------------------------------------------------- */

export type AssistantTurnStatus =
  | "clarify"
  | "preview"
  | "completed"
  | "cancelled"
  | "failed";

export type AssistantUiPreview = {
  proposalId: string;
  action: AssistantActionType;
  title?: string;
  summary?: string;
  totalCount: number;
  mediaIds: string[];
  thumbnails: Array<{
    mediaId: string;
    previewUrl: string | null;
    type?: "photo" | "video";
  }>;
  people: Array<{ id: string; name: string }>;
  dateLabel?: string;
  theme?: string;
  /** True for create previews; false for completed search result strips. */
  requiresConfirmation: boolean;
};

export type AssistantUiResponse = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: AssistantTurnStatus;
  /** Warm assistant-facing copy for the UI. */
  message: string;
  clarifyingQuestions?: string[];
  preview?: AssistantUiPreview;
  result?: AssistantActionResult;
  actionId?: string;
  entities?: {
    memoryId?: string;
    movieId?: string;
    mediaIds?: string[];
  };
  intent?: AssistantIntent;
};

export type HandleAssistantTurnInput = {
  userId: string;
  /** Natural-language user text (also used for yes/no on multi-turn). */
  message: string;
  /** Existing thread; created when omitted. */
  conversationId?: string | null;
  /** Explicit confirm of a preview proposal (button). */
  confirmProposalId?: string | null;
  /** Explicit cancel of a preview/clarify proposal. */
  cancelProposalId?: string | null;
  /**
   * When true, create_memory / create_movie run immediately after a successful
   * media match. Prefer preview+confirm in production UIs.
   * Still never invents people or uses unclean media.
   */
  autoExecuteCreates?: boolean;
  /** Curated media subset when confirming a preview (mismatches removed in UI). */
  confirmMediaIds?: string[] | null;
  /** Forwarded to intent parser (tests / offline). */
  preferFallbackIntent?: boolean;
  parseOptions?: Omit<ParseIntentOptions, "knownPeople" | "preferFallback">;
};
/* -------------------------------------------------------------------------- */
/* Entry points                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Handle one user turn (new request, clarification reply, or confirmation).
 */
export async function handleAssistantTurn(
  input: HandleAssistantTurnInput,
): Promise<AssistantUiResponse> {
  const userId = input.userId;
  const conversationId = await ensureConversation(
    userId,
    input.conversationId,
  );

  const rawMessage = input.message.trim();
  const userText =
    rawMessage ||
    (input.confirmProposalId
      ? "Yes"
      : input.cancelProposalId
        ? "Cancel"
        : "");

  if (!userText) {
    return failTurn({
      conversationId,
      userMessageId: "",
      message: "Tell me what you’d like to find or create in your vault.",
    });
  }

  const userMessage = await addMessage({
    conversationId,
    userId,
    role: "user",
    content: userText,
  });

  const peopleRows = await listPeopleForUser(userId);
  const knownPeople = peopleRows.map((p) => p.name);
  const recent = await listMessages(conversationId, userId, { limit: 40 });
  const openProposal = findOpenProposal(recent, {
    preferId: input.confirmProposalId ?? input.cancelProposalId ?? null,
  });

  // --- Cancel ---
  if (
    input.cancelProposalId ||
    (openProposal && isCancelMessage(userText) && !input.confirmProposalId)
  ) {
    if (openProposal) {
      await markProposal(openProposal.messageId, userId, openProposal.proposal, "cancelled");
      logAssistantConfirm({
        userId,
        conversationId,
        proposalId: openProposal.proposal.id,
        outcome: "cancelled",
      });
    }
    return reply(conversationId, userMessage.id, userId, {
      status: "cancelled",
      message:
        "Okay — I’ve cancelled that. Whenever you’re ready, we can try again gently.",
      intent: openProposal?.proposal.intent,
    });
  }

  // --- Confirm preview ---
  if (
    openProposal?.proposal.stage === "preview" &&
    (input.confirmProposalId === openProposal.proposal.id ||
      isConfirmMessage(userText))
  ) {
    logAssistantConfirm({
      userId,
      conversationId,
      proposalId: openProposal.proposal.id,
      outcome: "confirmed",
      action: openProposal.proposal.intent.action,
    });
    return completeFromProposal({
      userId,
      conversationId,
      userMessageId: userMessage.id,
      proposalMessageId: openProposal.messageId,
      proposal: openProposal.proposal,
      selectedMediaIds: input.confirmMediaIds ?? undefined,
    });
  }

  // --- Clarification follow-up ---
  let seedIntent: AssistantIntent | null = null;
  if (openProposal?.proposal.stage === "clarify") {
    seedIntent = await mergeClarificationIntent({
      previous: openProposal.proposal.intent,
      reply: userText,
      knownPeople,
      preferFallback: input.preferFallbackIntent,
      parseOptions: input.parseOptions,
    });
    await markProposal(openProposal.messageId, userId, openProposal.proposal, "consumed");
  }

  // --- Fresh (or merged) parse ---
  const parsed =
    seedIntent ??
    (await parseIntent(userText, {
      knownPeople,
      preferFallback: input.preferFallbackIntent,
      ...input.parseOptions,
    }));

  const intent = stripParseMeta(parsed);

  await mergeMessageMetadata(userMessage.id, userId, {
    intent,
  });

  let resolved = await resolveIntent(userId, intent);
  resolved = await revalidateResolvedPeople(userId, resolved);

  if (isPrivateVaultAction(intent.action)) {
    const vaultResponse = await handlePrivateVaultTurn({
      userId,
      conversationId,
      userMessageId: userMessage.id,
      intent,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: vaultResponse.status,
      action: intent.action,
    });
    return vaultResponse;
  }

  // Product how-to — answer from knowledge; do not run photo search.
  if (intent.action === "answer_help") {
    const helpResponse = await executeAndReply({
      userId,
      conversationId,
      userMessageId: userMessage.id,
      intent,
      resolved: emptyResolvedIntent(intent),
      media: emptyMediaResult(),
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: helpResponse.status,
      action: intent.action,
    });
    return helpResponse;
  }

  if (
    resolved.needsClarification ||
    intent.action === "clarify" ||
    shouldClarifyBeforeCreate(intent, resolved) ||
    shouldClarifyBeforeSearch(intent, resolved)
  ) {
    if (shouldClarifyBeforeCreate(intent, resolved) && !resolved.needsClarification) {
      resolved = {
        ...resolved,
        needsClarification: true,
        clarifyingQuestions: uniqueStrings([
          ...resolved.clarifyingQuestions,
          "Who should this focus on, is there a year or season, or what object/scene should it include (for example bounce house or birthday cake)?",
        ]),
      };
    }
    if (shouldClarifyBeforeSearch(intent, resolved) && !resolved.needsClarification) {
      resolved = {
        ...resolved,
        needsClarification: true,
        clarifyingQuestions: uniqueStrings([
          ...resolved.clarifyingQuestions,
          "Who should I look for, what year or season, or what object/scene should I search for (for example bounce house, birthday cake, or beach)?",
        ]),
      };
    }
    const clarifyResponse = await respondClarify({
      userId,
      conversationId,
      userMessageId: userMessage.id,
      intent,
      resolved,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: "clarify",
      action: intent.action,
      peopleCount: resolved.peopleIds.length,
    });
    return clarifyResponse;
  }

  const media = await queryMediaForResolvedIntent(userId, resolved, {
    sampleSize: intent.action === "search_media" ? 24 : 6,
    limit: ASSISTANT_CREATE_MEDIA_LIMIT,
    sort:
      intent.action === "search_media" ? "newest" : "chronological",
  });

  const minRequired =
    intent.action === "create_movie"
      ? MIN_MEDIA_FOR_MOVIE
      : intent.action === "create_memory"
        ? MIN_MEDIA_FOR_MEMORY
        : 0;

  if (intent.action !== "search_media" && media.totalCount < minRequired) {
    const sparseResponse = await respondSparse({
      userId,
      conversationId,
      userMessageId: userMessage.id,
      intent,
      resolved,
      media,
      minRequired,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: "clarify",
      action: intent.action,
      reason: "sparse_media",
      mediaCount: media.totalCount,
      minRequired,
    });
    return sparseResponse;
  }

  // Search is safe to auto-run; creates preview unless autoExecuteCreates.
  const shouldPreview =
    (intent.action === "create_memory" || intent.action === "create_movie") &&
    !input.autoExecuteCreates;

  if (shouldPreview) {
    const previewResponse = await respondPreview({
      userId,
      conversationId,
      userMessageId: userMessage.id,
      intent,
      resolved,
      media,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: "preview",
      action: intent.action,
      mediaCount: media.totalCount,
      theme: chooseMovieStyle(intent),
    });
    return previewResponse;
  }

  const completed = await executeAndReply({
    userId,
    conversationId,
    userMessageId: userMessage.id,
    intent,
    resolved,
    media,
  });
  logAssistantTurn({
    userId,
    conversationId,
    status: completed.status,
    action: intent.action,
    mediaCount: media.totalCount,
    actionId: completed.actionId,
  });
  return completed;
}

/**
 * Confirm a preview proposal by id (UI button path).
 */
export async function confirmAssistantProposal(input: {
  userId: string;
  conversationId: string;
  proposalId: string;
  /** Optional curated subset of the proposal’s media IDs. */
  mediaIds?: string[] | null;
}): Promise<AssistantUiResponse> {
  return handleAssistantTurn({
    userId: input.userId,
    conversationId: input.conversationId,
    message: "Yes",
    confirmProposalId: input.proposalId,
    confirmMediaIds: input.mediaIds,
  });
}

/**
 * Cancel a pending proposal by id.
 */
export async function cancelAssistantProposal(input: {
  userId: string;
  conversationId: string;
  proposalId: string;
}): Promise<AssistantUiResponse> {
  return handleAssistantTurn({
    userId: input.userId,
    conversationId: input.conversationId,
    message: "Cancel",
    cancelProposalId: input.proposalId,
  });
}

/**
 * Turn search-result media into a create_memory or create_movie preview.
 */
export async function proposeCreateFromSearchResults(input: {
  userId: string;
  conversationId: string;
  mediaIds: string[];
  /** Prior search intent — people/qualities/date inform the working title. */
  seedIntent?: AssistantIntent | null;
  /** Default create_memory; pass create_movie for a slideshow draft. */
  createAction?: "create_memory" | "create_movie";
}): Promise<AssistantUiResponse> {
  const createAction = input.createAction ?? "create_memory";
  const conversationId = await ensureConversation(
    input.userId,
    input.conversationId,
  );

  const userText =
    createAction === "create_movie"
      ? "Create a movie from these photos"
      : "Create a memory from these photos";
  const userMessage = await addMessage({
    conversationId,
    userId: input.userId,
    role: "user",
    content: userText,
  });

  const seed = input.seedIntent;
  const intent: AssistantIntent = {
    action: createAction,
    people: seed?.people ?? [],
    date_range: seed?.date_range,
    tone: seed?.tone,
    qualities: seed?.qualities,
    visual_query: seed?.visual_query,
    objects: seed?.objects,
    scenes: seed?.scenes,
    theme_preference: seed?.theme_preference ?? (createAction === "create_movie" ? "simple" : undefined),
    title_suggestion: seed?.title_suggestion,
    raw_prompt: seed?.raw_prompt
      ? `${userText}: ${seed.raw_prompt}`
      : userText,
    confidence: 0.9,
  };

  let resolved = await resolveIntent(input.userId, intent);
  resolved = await revalidateResolvedPeople(input.userId, resolved);

  const media = await loadAssistantMediaByIds(input.userId, input.mediaIds, {
    sampleSize: Math.min(24, input.mediaIds.length || 6),
    limit: ASSISTANT_CREATE_MEDIA_LIMIT,
  });

  const minRequired =
    createAction === "create_movie" ? MIN_MEDIA_FOR_MOVIE : MIN_MEDIA_FOR_MEMORY;

  if (media.totalCount < minRequired) {
    return reply(conversationId, userMessage.id, input.userId, {
      status: "clarify",
      message:
        media.totalCount === 0
          ? `I couldn’t use those photos for a ${createAction === "create_movie" ? "movie" : "memory"} — they may no longer be available. Try searching again.`
          : `I need at least ${minRequired} photo(s) to create a ${createAction === "create_movie" ? "slideshow" : "memory"}.`,
      intent,
      clarifyingQuestions: [
        "Search again, or pick a person / time period / object so I can gather more photos.",
      ],
      entities: { mediaIds: media.items.map((i) => i.id) },
    });
  }

  const previewResponse = await respondPreview({
    userId: input.userId,
    conversationId,
    userMessageId: userMessage.id,
    intent,
    resolved,
    media,
  });

  logAssistantTurn({
    userId: input.userId,
    conversationId,
    status: "preview",
    action: createAction,
    mediaCount: media.totalCount,
    reason: "from_search",
  });

  return previewResponse;
}

/** @deprecated Prefer proposeCreateFromSearchResults */
export async function proposeMemoryFromSearchResults(input: {
  userId: string;
  conversationId: string;
  mediaIds: string[];
  seedIntent?: AssistantIntent | null;
}): Promise<AssistantUiResponse> {
  return proposeCreateFromSearchResults({
    ...input,
    createAction: "create_memory",
  });
}

/* -------------------------------------------------------------------------- */
/* Pipeline stages                                                             */
/* -------------------------------------------------------------------------- */

async function respondClarify(input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  intent: AssistantIntent;
  resolved: ResolvedIntent;
}): Promise<AssistantUiResponse> {
  const questions = uniqueStrings([
    ...input.resolved.clarifyingQuestions,
    ...(input.intent.clarifying_questions ?? []),
  ]);
  const list =
    questions.length > 0
      ? questions
      : [
          "Who should this focus on, and would you like a photo search, a memory album, or a slideshow?",
        ];

  const proposal = buildProposal({
    stage: "clarify",
    intent: input.intent,
    resolved: input.resolved,
    media: emptyMediaResult(),
    clarifyingQuestions: list,
  });

  const message = buildClarifyCopy(input.intent, list);

  return reply(input.conversationId, input.userMessageId, input.userId, {
    status: "clarify",
    message,
    clarifyingQuestions: list,
    intent: input.intent,
    pendingProposal: proposal,
  });
}

async function handlePrivateVaultTurn(input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  intent: AssistantIntent;
}): Promise<AssistantUiResponse> {
  const questions = uniqueStrings([
    ...(input.intent.clarifying_questions ?? []),
    ...buildPrivateVaultClarifyingQuestions(input.intent),
  ]);

  if (input.intent.action === "review_legacy_checklist") {
    return executeAndReply({
      userId: input.userId,
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      intent: input.intent,
      resolved: emptyResolvedIntent(input.intent),
      media: emptyMediaResult(),
    });
  }

  if (questions.length > 0 || input.intent.action === "clarify") {
    return respondClarify({
      userId: input.userId,
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      intent: input.intent,
      resolved: {
        ...emptyResolvedIntent(input.intent),
        needsClarification: true,
        clarifyingQuestions: questions,
      },
    });
  }

  const proposal = buildProposal({
    stage: "preview",
    intent: input.intent,
    resolved: emptyResolvedIntent(input.intent),
    media: emptyMediaResult(),
    clarifyingQuestions: [],
    titleSuggestion:
      input.intent.document_category ??
      input.intent.legacy_contact_name ??
      input.intent.legacy_instruction_title,
  });

  return reply(input.conversationId, input.userMessageId, input.userId, {
    status: "preview",
    message: buildPrivateVaultPreviewCopy(input.intent),
    intent: input.intent,
    pendingProposal: proposal,
    preview: {
      proposalId: proposal.id,
      action: input.intent.action,
      title:
        input.intent.document_category ??
        input.intent.legacy_contact_name ??
        input.intent.legacy_instruction_title,
      summary: buildPrivateVaultPreviewSummary(input.intent),
      totalCount: 0,
      mediaIds: [],
      thumbnails: [],
      people: [],
      requiresConfirmation: true,
    },
  });
}

async function respondSparse(input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  intent: AssistantIntent;
  resolved: ResolvedIntent;
  media: AssistantMediaQueryResult;
  minRequired: number;
}): Promise<AssistantUiResponse> {
  const explanation = explainSparseMediaResults({
    diagnostics: input.media.diagnostics,
    matchedPeople: input.resolved.matchedPeople,
    sparseThreshold: input.minRequired,
    visualQuery: input.intent.visual_query,
  });

  const questions = [
    `I only found ${input.media.totalCount} matching photo(s), and I’d like at least ${input.minRequired} before creating anything.`,
    ...explanation.suggestions,
  ];

  const proposal = buildProposal({
    stage: "clarify",
    intent: input.intent,
    resolved: input.resolved,
    media: input.media,
    clarifyingQuestions: questions,
  });

  const message = buildSparseCopy(input.intent, explanation.summary, questions);

  return reply(input.conversationId, input.userMessageId, input.userId, {
    status: "clarify",
    message,
    clarifyingQuestions: questions,
    intent: input.intent,
    pendingProposal: proposal,
    entities: { mediaIds: input.media.items.map((i) => i.id) },
  });
}

async function respondPreview(input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  intent: AssistantIntent;
  resolved: ResolvedIntent;
  media: AssistantMediaQueryResult;
}): Promise<AssistantUiResponse> {
  const title = buildMemoryTitle(input.intent, input.resolved);
  const theme =
    input.intent.action === "create_movie"
      ? chooseMovieStyle(input.intent)
      : input.intent.theme_preference;

  // Only promise photos we can actually attach (query page / safety cap).
  const usableCount = input.media.items.length;
  const totalMatched = input.media.totalCount;

  const proposal = buildProposal({
    stage: "preview",
    intent: input.intent,
    resolved: input.resolved,
    media: input.media,
    clarifyingQuestions: [],
    titleSuggestion: title,
    themePreference: theme,
  });

  const message = buildPreviewCopy({
    intent: input.intent,
    resolved: input.resolved,
    totalCount: usableCount,
    totalMatched,
    title,
    theme,
    mediaItems: input.media.items,
  });

  await updateConversationTitle(
    input.conversationId,
    input.userId,
    title,
  ).catch(() => undefined);

  return reply(input.conversationId, input.userMessageId, input.userId, {
    status: "preview",
    message,
    intent: input.intent,
    pendingProposal: proposal,
    preview: {
      proposalId: proposal.id,
      action: input.intent.action,
      title,
      totalCount: usableCount,
      mediaIds: proposal.mediaIds,
      thumbnails: proposal.sampleThumbnails,
      people: input.resolved.matchedPeople.map((p) => ({
        id: p.id,
        name: p.name,
      })),
      dateLabel: input.resolved.dateFilter?.label,
      theme,
      requiresConfirmation: true,
    },
    entities: { mediaIds: proposal.mediaIds },
  });
}

async function executeAndReply(input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  intent: AssistantIntent;
  resolved: ResolvedIntent;
  media: AssistantMediaQueryResult;
}): Promise<AssistantUiResponse> {
  const outcome = await executeAssistantAction({
    userId: input.userId,
    conversationId: input.conversationId,
    messageId: input.userMessageId,
    intent: input.intent,
    resolved: input.resolved,
    media: input.media,
    writeAssistantReply: false,
  });

  const message = buildCompletionCopy(input.intent, outcome.result, outcome.assistantMessage);
  const entities = entitiesFromResult(outcome.result);

  // Search completions need the same preview strip as create drafts so users
  // can see and open matching photos (not only a library-wide browse link).
  const searchPreview =
    input.intent.action === "search_media" &&
    outcome.result.type === "search_media" &&
    input.media.totalCount > 0
      ? ({
          proposalId: `search-${outcome.actionId}`,
          action: "search_media" as const,
          title: formatVisualRelatedLabel(input.intent) ?? undefined,
          summary: message,
          totalCount: input.media.totalCount,
          mediaIds: input.media.items.map((item) => item.id),
          thumbnails: input.media.sampleThumbnails.map(serializeThumb),
          people: input.resolved.matchedPeople.map((p) => ({
            id: p.id,
            name: p.name,
          })),
          dateLabel: input.resolved.dateFilter?.label,
          requiresConfirmation: false,
        } satisfies AssistantUiPreview)
      : undefined;

  const assistantMessage = await addMessage({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "assistant",
    content: message,
    metadata: {
      intent: input.intent,
      actionIds: [outcome.actionId],
      mediaIds: entities?.mediaIds,
      ...(searchPreview
        ? {
            searchPreview: {
              totalCount: searchPreview.totalCount,
              mediaIds: searchPreview.mediaIds,
              sampleThumbnails: searchPreview.thumbnails,
              people: searchPreview.people,
              dateLabel: searchPreview.dateLabel,
            },
          }
        : {}),
    },
  });

  return {
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    assistantMessageId: assistantMessage.id,
    status:
      outcome.status === "failed"
        ? "failed"
        : outcome.status === "needs_clarification"
          ? "clarify"
          : "completed",
    message,
    clarifyingQuestions:
      outcome.result.type === "clarify" ? outcome.result.questions : undefined,
    preview: searchPreview,
    result: outcome.result,
    actionId: outcome.actionId,
    entities,
    intent: input.intent,
  };
}

async function completeFromProposal(input: {
  userId: string;
  conversationId: string;
  userMessageId: string;
  proposalMessageId: string;
  proposal: AssistantPendingProposal;
  selectedMediaIds?: string[];
}): Promise<AssistantUiResponse> {
  const { proposal } = input;
  await markProposal(
    input.proposalMessageId,
    input.userId,
    proposal,
    "consumed",
  );

  // Never trust stored people IDs blindly — re-check ownership.
  let resolved = proposalToResolved(proposal);
  resolved = await revalidateResolvedPeople(input.userId, resolved);

  if (isPrivateVaultAction(proposal.intent.action)) {
    return executeAndReply({
      userId: input.userId,
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      intent: proposal.intent,
      resolved: emptyResolvedIntent(proposal.intent),
      media: emptyMediaResult(),
    });
  }

  if (resolved.needsClarification || resolved.peopleIds.length === 0) {
    // People were removed / invalid since the preview.
    if (proposal.intent.action !== "search_media") {
      // Visual-only creates (no people) can still proceed when media is curated.
      const hasCuratedMedia =
        (input.selectedMediaIds?.length ?? 0) > 0 ||
        proposal.mediaIds.length > 0;
      const hasVisualFocus =
        Boolean(proposal.intent.visual_query?.trim()) ||
        (proposal.intent.objects?.length ?? 0) > 0 ||
        (proposal.intent.scenes?.length ?? 0) > 0 ||
        (proposal.intent.qualities?.length ?? 0) > 0;
      if (!(hasCuratedMedia && (hasVisualFocus || proposal.mediaIds.length > 0))) {
        return respondClarify({
          userId: input.userId,
          conversationId: input.conversationId,
          userMessageId: input.userMessageId,
          intent: proposal.intent,
          resolved: {
            ...resolved,
            clarifyingQuestions: uniqueStrings([
              ...resolved.clarifyingQuestions,
              "Who should this focus on before I create anything?",
            ]),
          },
        });
      }
    }
  }

  const allowed = new Set(proposal.mediaIds);
  const curated =
    input.selectedMediaIds && input.selectedMediaIds.length > 0
      ? input.selectedMediaIds.filter((id) => allowed.has(id))
      : proposal.mediaIds;

  const media =
    curated.length > 0
      ? await loadAssistantMediaByIds(input.userId, curated, {
          sampleSize: Math.min(24, curated.length),
          limit: ASSISTANT_CREATE_MEDIA_LIMIT,
        })
      : await queryMediaForResolvedIntent(input.userId, resolved, {
          sampleSize: 6,
          limit: ASSISTANT_CREATE_MEDIA_LIMIT,
          sort:
            proposal.intent.action === "search_media"
              ? "newest"
              : "chronological",
        });

  return executeAndReply({
    userId: input.userId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    intent: proposal.intent,
    resolved,
    media,
  });
}

/* -------------------------------------------------------------------------- */
/* Clarification merge                                                         */
/* -------------------------------------------------------------------------- */

export async function mergeClarificationIntent(input: {
  previous: AssistantIntent;
  reply: string;
  knownPeople?: string[];
  preferFallback?: boolean;
  parseOptions?: Omit<ParseIntentOptions, "knownPeople" | "preferFallback">;
}): Promise<AssistantIntent> {
  const parsed = await parseIntent(input.reply, {
    knownPeople: input.knownPeople,
    preferFallback: input.preferFallback,
    ...input.parseOptions,
  });
  const next = stripParseMeta(parsed);

  // Short confirmations shouldn't wipe the prior plan.
  if (isConfirmMessage(input.reply) && input.previous.action !== "clarify") {
    return {
      ...input.previous,
      raw_prompt: `${input.previous.raw_prompt}\nUser clarification: ${input.reply}`,
      clarifying_questions: undefined,
      confidence: Math.max(input.previous.confidence ?? 0.6, 0.8),
    };
  }

  const mergedAction =
    next.action !== "clarify" ? next.action : input.previous.action;

  return {
    action: mergedAction === "clarify" ? input.previous.action : mergedAction,
    people: next.people.length > 0 ? next.people : input.previous.people,
    date_range: next.date_range ?? input.previous.date_range,
    tone: next.tone ?? input.previous.tone,
    qualities:
      next.qualities && next.qualities.length > 0
        ? next.qualities
        : input.previous.qualities,
    theme_preference: next.theme_preference ?? input.previous.theme_preference,
    title_suggestion: next.title_suggestion ?? input.previous.title_suggestion,
    document_title: next.document_title ?? input.previous.document_title,
    document_category: next.document_category ?? input.previous.document_category,
    document_category_description:
      next.document_category_description ??
      input.previous.document_category_description,
    legacy_contact_name:
      next.legacy_contact_name ?? input.previous.legacy_contact_name,
    legacy_contact_category:
      next.legacy_contact_category ?? input.previous.legacy_contact_category,
    legacy_contact_email:
      next.legacy_contact_email ?? input.previous.legacy_contact_email,
    legacy_contact_phone:
      next.legacy_contact_phone ?? input.previous.legacy_contact_phone,
    legacy_contact_relationship:
      next.legacy_contact_relationship ??
      input.previous.legacy_contact_relationship,
    legacy_instruction_section:
      next.legacy_instruction_section ??
      input.previous.legacy_instruction_section,
    legacy_instruction_title:
      next.legacy_instruction_title ?? input.previous.legacy_instruction_title,
    legacy_instruction_content:
      next.legacy_instruction_content ??
      input.previous.legacy_instruction_content,
    raw_prompt: `${input.previous.raw_prompt}\nUser clarification: ${input.reply}`,
    clarifying_questions: undefined,
    confidence: next.confidence ?? input.previous.confidence,
  };
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

export function isConfirmMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(yes|yep|yeah|yea|ok|okay|sure|please|confirm|go ahead|do it|create it|make it|looks good|that works|perfect)\b/.test(
    t,
  );
}

export function isCancelMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no|nope|cancel|stop|nevermind|never mind|don't|dont)\b/.test(t);
}

function buildClarifyCopy(intent: AssistantIntent, questions: string[]): string {
  const intro = isMemorial(intent)
    ? "I want to handle this with care. Before I gather photos, could you help me with a couple of details?"
    : "Happy to help — I just need a little more clarity:";

  return [intro, ...questions.map((q, i) => `${i + 1}. ${q}`)].join("\n");
}

function buildSparseCopy(
  intent: AssistantIntent,
  summary: string,
  questions: string[],
): string {
  const intro = isMemorial(intent)
    ? "I found fewer photos than I’d want for a meaningful tribute, and I don’t want to rush something this important."
    : "I found fewer photos than I’d need to do this well.";

  return [intro, summary, ...questions.map((q) => `• ${q}`)].join("\n");
}

function formatVisualRelatedLabel(intent: AssistantIntent): string | null {
  const label =
    intent.visual_query?.trim() ||
    [...(intent.objects ?? []), ...(intent.scenes ?? [])].join(" / ") ||
    intent.qualities?.slice(0, 4).join(" / ");
  return label?.trim() || null;
}

function buildPreviewCopy(input: {
  intent: AssistantIntent;
  resolved: ResolvedIntent;
  totalCount: number;
  totalMatched?: number;
  title: string;
  theme?: string;
  mediaItems?: Array<{ type: string }>;
}): string {
  const visual = formatVisualRelatedLabel(input.intent);
  const whoNames = input.resolved.matchedPeople.map((p) => p.name);
  const who =
    whoNames.length > 0
      ? whoNames.join(", ")
      : visual
        ? null
        : "your family";
  const when = input.resolved.dateFilter?.label
    ? ` from ${input.resolved.dateFilter.label}`
    : "";
  const qualities =
    input.intent.qualities && input.intent.qualities.length > 0 && !visual
      ? ` I’ll keep ${input.intent.qualities.join(" and ")} in mind.`
      : "";
  const moreNote =
    input.totalMatched && input.totalMatched > input.totalCount
      ? ` (using ${input.totalCount} of ${input.totalMatched} matches)`
      : "";

  const countLabel =
    input.mediaItems && input.mediaItems.length > 0
      ? formatMediaTypeCounts(input.mediaItems)
      : `${input.totalCount} item${input.totalCount === 1 ? "" : "s"}`;

  const foundLine = visual
    ? `Found ${countLabel} related to ${visual}${who ? ` featuring ${who}` : ""}${when}${moreNote}.`
    : `I found ${countLabel} of ${who}${when}${moreNote}.`;

  if (input.intent.action === "create_movie" && isMemorial(input.intent)) {
    return [
      foundLine,
      `If it feels right, I can create a cinematic tribute titled “${input.title}”.${qualities}`,
      "Reply yes to begin, or tell me what to adjust.",
    ].join(" ");
  }

  if (input.intent.action === "create_movie") {
    return [
      foundLine,
      `I can make a ${input.theme ?? "simple"} slideshow called “${input.title}”.${qualities}`,
      "Does that look right? Reply yes to create it.",
    ].join(" ");
  }

  return [
    foundLine,
    `I can gather them into a memory album titled “${input.title}”.${qualities}`,
    "Reply yes to create it, or tell me what to change.",
  ].join(" ");
}

function buildPrivateVaultPreviewCopy(intent: AssistantIntent): string {
  switch (intent.action) {
    case "create_document_category":
      return `I’m ready to create the private document category “${intent.document_category}”. I won’t upload any files from chat. Confirm when you want me to create it.`;
    case "file_private_document":
      return `I’m ready to file “${intent.document_title}” under “${intent.document_category}”. Confirm and I’ll update that private document only.`;
    case "add_legacy_contact":
      return `I’m ready to add ${intent.legacy_contact_name} to your Digital Legacy contacts${intent.legacy_contact_category ? ` as ${intent.legacy_contact_category.replace(/_/g, " ")}` : ""}. Confirm before I save it.`;
    case "draft_legacy_business":
      return "I drafted a starter business transition note for your Digital Legacy section. Confirm if you want me to save it there, or tell me what to adjust first.";
    default:
      return "I’m ready to make that change. Confirm if it looks right.";
  }
}

function buildCompletionCopy(
  intent: AssistantIntent,
  result: AssistantActionResult,
  fallback: string,
): string {
  if (result.type === "search_media") {
    const visual = formatVisualRelatedLabel(intent);
    const helpAside = formatSecondaryHelpTip(intent.raw_prompt) ?? "";
    const countLabel = `${result.count} item${result.count === 1 ? "" : "s"}`;
    if (result.count === 0) {
      const empty = isMemorial(intent)
        ? "I couldn’t find matching photos or videos yet. When you’re ready, we can widen the search together."
        : fallback;
      // Fallback may already include the mixed-help tip from the executor.
      return /\n\nAlso —/.test(empty) ? empty : `${empty}${helpAside}`;
    }
    if (visual) {
      const lead = `Found ${countLabel} related to ${visual}.`;
      if (result.count < ASSISTANT_SEARCH_SPARSE_THRESHOLD) {
        return `${lead} You can browse them, create a memory, or try a broader term.${helpAside}`;
      }
      return `${lead} I’ve pulled a few previews — browse results, or create a Memory / Movie from them.${helpAside}`;
    }
    if (result.count < ASSISTANT_SEARCH_SPARSE_THRESHOLD) {
      return `I only found ${countLabel}. You can browse them, or tell me a broader year or another person to include.${helpAside}`;
    }
    return `Here are ${countLabel}. I’ve pulled a few previews for you.${helpAside}`;
  }

  if (result.type === "create_memory") {
    return `Done — I created “${result.title ?? "your memory"}” with ${result.mediaIds?.length ?? 0} item${(result.mediaIds?.length ?? 0) === 1 ? "" : "s"}.`;
  }

  if (result.type === "create_movie") {
    if (isMemorial(intent)) {
      return `I’ve started a tribute film titled “${result.title ?? "In Memory"}”. I’ll let you know when the render is ready — take your time viewing it.`;
    }
    return `I’ve started your slideshow “${result.title ?? "Family movie"}”. I’ll notify you when it’s ready.`;
  }

  if (result.type === "clarify") {
    return buildClarifyCopy(intent, result.questions);
  }

  if (result.type === "create_document_category") {
    return `I created the private document category “${result.name}”.`;
  }

  if (result.type === "file_private_document") {
    return `I filed “${result.documentTitle}” under “${result.categoryName}”.`;
  }

  if (result.type === "add_legacy_contact") {
    return `I added ${result.name} to your Digital Legacy contacts.`;
  }

  if (result.type === "draft_legacy_business") {
    return "I saved a starter business transition draft in your Digital Legacy instructions.";
  }

  if (result.type === "review_legacy_checklist") {
    return result.missing.length === 0
      ? "Your Digital Legacy checklist looks complete."
      : `Your Digital Legacy checklist is ${result.completed} of ${result.total} complete. I listed what is still missing.`;
  }

  if (result.type === "answer_help") {
    return fallback;
  }

  if (result.type === "error") {
    const safe = publicAssistantErrorMessage(new Error(result.message));
    return isMemorial(intent)
      ? `I ran into a problem and paused so nothing incomplete was created. ${safe}`
      : safe;
  }

  return fallback;
}

function isMemorial(intent: AssistantIntent): boolean {
  return (
    intent.tone === "memorial" ||
    /\b(memorial|tribute|in memory|remembrance)\b/i.test(intent.raw_prompt)
  );
}

/* -------------------------------------------------------------------------- */
/* Persistence helpers                                                         */
/* -------------------------------------------------------------------------- */

async function ensureConversation(
  userId: string,
  conversationId: string | null | undefined,
): Promise<string> {
  if (conversationId) {
    const existing = await getConversationForUser(conversationId, userId);
    if (existing) return existing.id;
  }
  const created = await createConversation({ userId });
  return created.id;
}

async function reply(
  conversationId: string,
  userMessageId: string,
  userId: string,
  input: {
    status: AssistantTurnStatus;
    message: string;
    clarifyingQuestions?: string[];
    intent?: AssistantIntent;
    pendingProposal?: AssistantPendingProposal;
    preview?: AssistantUiPreview;
    result?: AssistantActionResult;
    actionId?: string;
    entities?: AssistantUiResponse["entities"];
  },
): Promise<AssistantUiResponse> {
  const metadata: AssistantMessageMetadata = {
    intent: input.intent,
    mediaIds: input.entities?.mediaIds,
    pendingProposal: input.pendingProposal ?? null,
  };

  const assistantMessage = await addMessage({
    conversationId,
    userId,
    role: "assistant",
    content: input.message,
    metadata,
  });

  return {
    conversationId,
    userMessageId,
    assistantMessageId: assistantMessage.id,
    status: input.status,
    message: input.message,
    clarifyingQuestions: input.clarifyingQuestions,
    preview: input.preview,
    result: input.result,
    actionId: input.actionId,
    entities: input.entities,
    intent: input.intent,
  };
}

async function failTurn(input: {
  conversationId: string;
  userMessageId: string;
  message: string;
}): Promise<AssistantUiResponse> {
  return {
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    assistantMessageId: "",
    status: "failed",
    message: input.message,
  };
}

function findOpenProposal(
  messages: Array<{ id: string; role: string; metadata: AssistantMessageMetadata }>,
  options?: { preferId?: string | null },
): { messageId: string; proposal: AssistantPendingProposal } | null {
  const preferId = options?.preferId ?? null;

  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]!;
    if (row.role !== "assistant") continue;
    const proposal = row.metadata?.pendingProposal;
    if (!proposal || proposal.status !== "open") continue;
    if (preferId && proposal.id !== preferId) continue;
    return { messageId: row.id, proposal };
  }

  // If preferId was set but status check failed, still search any matching id.
  if (preferId) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const row = messages[i]!;
      const proposal = row.metadata?.pendingProposal;
      if (proposal?.id === preferId && proposal.status === "open") {
        return { messageId: row.id, proposal };
      }
    }
  }

  return null;
}

async function markProposal(
  messageId: string,
  userId: string,
  proposal: AssistantPendingProposal,
  status: AssistantPendingProposal["status"],
): Promise<void> {
  await mergeMessageMetadata(messageId, userId, {
    pendingProposal: { ...proposal, status },
  });
}

function buildProposal(input: {
  stage: "clarify" | "preview";
  intent: AssistantIntent;
  resolved: ResolvedIntent;
  media: AssistantMediaQueryResult;
  clarifyingQuestions: string[];
  titleSuggestion?: string;
  themePreference?: string;
}): AssistantPendingProposal {
  return {
    id: nanoid(),
    status: "open",
    stage: input.stage,
    intent: input.intent,
    peopleIds: input.resolved.peopleIds,
    matchedPeople: input.resolved.matchedPeople.map(serializeMatched),
    unresolvedPeople: input.resolved.unresolvedPeople.map(serializeUnresolved),
    dateFilter: serializeDateFilter(input.resolved.dateFilter),
    clarifyingQuestions: input.clarifyingQuestions,
    mediaIds: input.media.items.map((item) => item.id),
    totalCount: input.media.totalCount,
    sampleThumbnails: input.media.sampleThumbnails.map(serializeThumb),
    titleSuggestion: input.titleSuggestion,
    themePreference: input.themePreference,
    createdAt: new Date().toISOString(),
  };
}

function proposalToResolved(proposal: AssistantPendingProposal): ResolvedIntent {
  return {
    intent: proposal.intent,
    peopleIds: proposal.peopleIds,
    matchedPeople: proposal.matchedPeople,
    unresolvedPeople: proposal.unresolvedPeople,
    dateFilter: proposal.dateFilter,
    needsClarification: false,
    clarifyingQuestions: [],
  };
}

function emptyMediaResult(): AssistantMediaQueryResult {
  return {
    items: [],
    totalCount: 0,
    sampleThumbnails: [],
    diagnostics: {
      matchedCount: 0,
      cleanReadyTotal: 0,
      withPeopleOnly: null,
      withDateOnly: null,
      peopleWithoutFaces: [],
      dateFilterApplied: false,
      dateFilterConcrete: false,
      textHintsApplied: false,
      peopleMatch: "any",
      peopleIdCount: 0,
    },
  };
}

function emptyResolvedIntent(intent: AssistantIntent): ResolvedIntent {
  return {
    intent,
    peopleIds: [],
    matchedPeople: [],
    unresolvedPeople: [],
    dateFilter: null,
    needsClarification: false,
    clarifyingQuestions: [],
  };
}

function entitiesFromResult(
  result: AssistantActionResult,
): AssistantUiResponse["entities"] {
  if (result.type === "create_memory") {
    return { memoryId: result.memoryId, mediaIds: result.mediaIds };
  }
  if (result.type === "create_movie") {
    return { memoryId: result.memoryId, movieId: result.movieId };
  }
  if (result.type === "search_media") {
    return { mediaIds: result.mediaIds };
  }
  return undefined;
}

function stripParseMeta(intent: AssistantIntent & { _meta?: unknown }): AssistantIntent {
  const { _meta: _ignored, ...rest } = intent as AssistantIntent & {
    _meta?: unknown;
  };
  return rest;
}

function serializeMatched(person: MatchedPerson) {
  return {
    id: person.id,
    name: person.name,
    matchedOn: person.matchedOn,
    score: person.score,
  };
}

function serializeUnresolved(person: UnresolvedPerson) {
  return {
    query: person.query,
    reason: person.reason,
    candidates: person.candidates.map((c) => ({
      id: c.id,
      name: c.name,
      score: c.score,
    })),
  };
}

function serializeDateFilter(filter: DateFilter | null) {
  if (!filter) return null;
  return {
    label: filter.label,
    start: filter.start,
    end: filter.end,
    isConcrete: filter.isConcrete,
    resolutionNote: filter.resolutionNote,
  };
}

function serializeThumb(thumb: AssistantMediaThumbnail) {
  return {
    mediaId: thumb.mediaId,
    previewUrl: thumb.previewUrl,
    type: thumb.type,
  };
}

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
