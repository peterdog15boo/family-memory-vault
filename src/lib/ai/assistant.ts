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
import { parseIntent, classifyAskIntent, type ParseIntentOptions } from "@/lib/ai/intent";
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
  buildClarifyCopy,
  buildCompletionCopy,
  buildPreviewCopy,
  buildPrivateVaultPreviewCopy,
  buildSparseCopy,
} from "@/lib/ai/assistant-copy";
import {
  resolveAssistantLocale,
  assistantLanguageName,
  type AssistantLocaleContext,
} from "@/lib/ai/locale";
import { localizeAssistantProse } from "@/lib/ai/localize";
import { createTranslator, DEFAULT_LOCALE, type AppLocale, type TranslateFn } from "@/lib/i18n";
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
  parseOptions?: Omit<ParseIntentOptions, "knownPeople" | "preferFallback" | "locale">;
  /** UI locale; defaults to the user’s account preference. */
  locale?: AppLocale;
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
  const localeCtx: AssistantLocaleContext =
    input.locale != null
      ? {
          locale: input.locale,
          t: createTranslator(input.locale),
          languageName: assistantLanguageName(input.locale),
        }
      : await resolveAssistantLocale(userId);
  const { locale, t } = localeCtx;

  const conversationId = await ensureConversation(
    userId,
    input.conversationId,
  );

  const rawMessage = input.message.trim();
  const userText =
    rawMessage ||
    (input.confirmProposalId
      ? t("assistant.yes")
      : input.cancelProposalId
        ? t("assistant.cancel")
        : "");

  if (!userText) {
    return failTurn({
      conversationId,
      userMessageId: "",
      message: t("assistant.reply.emptyPrompt"),
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
      message: t("assistant.reply.cancelledGentle"),
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
      locale,
      t,
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
      parseOptions: { ...input.parseOptions, locale },
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
      locale,
    }));

  const intent = stripParseMeta(parsed);

  await mergeMessageMetadata(userMessage.id, userId, {
    intent,
  });

  let resolved = await resolveIntent(userId, intent);
  resolved = await revalidateResolvedPeople(userId, resolved);
  const intentKind = classifyAskIntent(resolved.intent);
  resolved = preferVisualSearchOverPersonClarify(resolved, intentKind);

  if (isPrivateVaultAction(intent.action)) {
    const vaultResponse = await handlePrivateVaultTurn({
      userId,
      conversationId,
      userMessageId: userMessage.id,
      intent,
      t,
      locale,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: vaultResponse.status,
      action: intent.action,
      intentKind,
      searchMode: "none",
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
      locale,
      t,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: helpResponse.status,
      action: intent.action,
      intentKind,
      searchMode: "none",
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
          t("assistant.reply.clarifyFocus"),
        ]),
      };
    }
    if (shouldClarifyBeforeSearch(intent, resolved) && !resolved.needsClarification) {
      resolved = {
        ...resolved,
        needsClarification: true,
        clarifyingQuestions: uniqueStrings([
          ...resolved.clarifyingQuestions,
          t("assistant.reply.clarifySearch"),
        ]),
      };
    }
    const clarifyResponse = await respondClarify({
      userId,
      conversationId,
      userMessageId: userMessage.id,
      intent,
      resolved,
      t,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: "clarify",
      action: intent.action,
      intentKind,
      searchMode: "clarify",
      peopleCount: resolved.peopleIds.length,
      visualQuery: intent.visual_query ?? null,
      objects: intent.objects ?? [],
      scenes: intent.scenes ?? [],
    });
    return clarifyResponse;
  }

  const media = await queryMediaForResolvedIntent(userId, resolved, {
    sampleSize: intent.action === "search_media" ? 24 : 6,
    limit: ASSISTANT_CREATE_MEDIA_LIMIT,
    sort:
      intent.action === "search_media" ? "newest" : "chronological",
  });

  const searchMode = media.diagnostics.searchMode;
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
      t,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: "clarify",
      action: intent.action,
      reason: "sparse_media",
      intentKind,
      searchMode,
      mediaCount: media.totalCount,
      minRequired,
      visualQuery: intent.visual_query ?? null,
      visualLabeledTotal: media.diagnostics.visualLabeledTotal,
      visualUnlabeledTotal: media.diagnostics.visualUnlabeledTotal,
      lowVisualCoverage: media.diagnostics.lowVisualCoverage,
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
      t,
    });
    logAssistantTurn({
      userId,
      conversationId,
      status: "preview",
      action: intent.action,
      intentKind,
      searchMode,
      mediaCount: media.totalCount,
      theme: chooseMovieStyle(intent),
      visualQuery: intent.visual_query ?? null,
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
    locale,
    t,
  });
  logAssistantTurn({
    userId,
    conversationId,
    status: completed.status,
    action: intent.action,
    intentKind,
    searchMode,
    mediaCount: media.totalCount,
    peopleCount: resolved.peopleIds.length,
    visualQuery: intent.visual_query ?? null,
    objects: intent.objects ?? [],
    scenes: intent.scenes ?? [],
      visualLabeledTotal: media.diagnostics.visualLabeledTotal,
      visualUnlabeledTotal: media.diagnostics.visualUnlabeledTotal,
      lowVisualCoverage: media.diagnostics.lowVisualCoverage,
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
  locale?: AppLocale;
}): Promise<AssistantUiResponse> {
  return handleAssistantTurn({
    userId: input.userId,
    conversationId: input.conversationId,
    message: "Yes",
    confirmProposalId: input.proposalId,
    confirmMediaIds: input.mediaIds,
    locale: input.locale,
  });
}

/**
 * Cancel a pending proposal by id.
 */
export async function cancelAssistantProposal(input: {
  userId: string;
  conversationId: string;
  proposalId: string;
  locale?: AppLocale;
}): Promise<AssistantUiResponse> {
  return handleAssistantTurn({
    userId: input.userId,
    conversationId: input.conversationId,
    message: "Cancel",
    cancelProposalId: input.proposalId,
    locale: input.locale,
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
  locale?: AppLocale;
}): Promise<AssistantUiResponse> {
  const createAction = input.createAction ?? "create_memory";
  const localeCtx =
    input.locale != null
      ? {
          locale: input.locale,
          t: createTranslator(input.locale),
          languageName: assistantLanguageName(input.locale),
        }
      : await resolveAssistantLocale(input.userId);
  const { t } = localeCtx;
  const conversationId = await ensureConversation(
    input.userId,
    input.conversationId,
  );

  const userText =
    createAction === "create_movie"
      ? t("assistant.reply.createFromPhotosMovie")
      : t("assistant.reply.createFromPhotosMemory");
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
    const kind =
      createAction === "create_movie"
        ? t("assistant.reply.kindMovie")
        : t("assistant.reply.kindMemory");
    const kindNeed =
      createAction === "create_movie"
        ? t("assistant.reply.kindSlideshow")
        : t("assistant.reply.kindMemory");
    return reply(conversationId, userMessage.id, input.userId, {
      status: "clarify",
      message:
        media.totalCount === 0
          ? t("assistant.reply.unavailableFromSearch", { kind })
          : t("assistant.reply.needMoreFromSearch", {
              min: minRequired,
              kind: kindNeed,
            }),
      intent,
      clarifyingQuestions: [t("assistant.reply.searchAgainHint")],
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
    t,
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
  t: TranslateFn;
}): Promise<AssistantUiResponse> {
  const questions = uniqueStrings([
    ...input.resolved.clarifyingQuestions,
    ...(input.intent.clarifying_questions ?? []),
  ]);
  const list =
    questions.length > 0
      ? questions
      : [input.t("assistant.reply.emptyPromptQuestion")];

  const proposal = buildProposal({
    stage: "clarify",
    intent: input.intent,
    resolved: input.resolved,
    media: emptyMediaResult(),
    clarifyingQuestions: list,
  });

  const message = buildClarifyCopy(input.t, input.intent, list);

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
  t: TranslateFn;
  locale: AppLocale;
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
      locale: input.locale,
      t: input.t,
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
      t: input.t,
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
    message: buildPrivateVaultPreviewCopy(input.t, input.intent),
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
  t: TranslateFn;
}): Promise<AssistantUiResponse> {
  const explanation = explainSparseMediaResults({
    diagnostics: input.media.diagnostics,
    matchedPeople: input.resolved.matchedPeople,
    unresolvedPeople: input.resolved.unresolvedPeople,
    peopleNames: input.intent.people,
    sparseThreshold: input.minRequired,
    visualQuery: input.intent.visual_query,
    objects: input.intent.objects,
    scenes: input.intent.scenes,
    intentKind: classifyAskIntent(input.intent),
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

  const message = buildSparseCopy(input.t, input.intent, explanation.summary, questions);

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
  t: TranslateFn;
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

  const message = buildPreviewCopy(input.t, {
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
  locale: AppLocale;
  t: TranslateFn;
}): Promise<AssistantUiResponse> {
  const outcome = await executeAssistantAction({
    userId: input.userId,
    conversationId: input.conversationId,
    messageId: input.userMessageId,
    intent: input.intent,
    resolved: input.resolved,
    media: input.media,
    writeAssistantReply: false,
    locale: input.locale,
    t: input.t,
  });

  let message = buildCompletionCopy(
    input.t,
    input.intent,
    outcome.result,
    outcome.assistantMessage,
  );
  if (
    input.locale !== DEFAULT_LOCALE &&
    outcome.result.type === "search_media" &&
    outcome.result.count === 0
  ) {
    message = await localizeAssistantProse(message, input.locale);
  }
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
  locale: AppLocale;
  t: TranslateFn;
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
      locale: input.locale,
      t: input.t,
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
              input.t("assistant.reply.clarifyFocusWho"),
            ]),
          },
          t: input.t,
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
    locale: input.locale,
    t: input.t,
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

function formatVisualRelatedLabel(intent: AssistantIntent): string | null {
  const label =
    intent.visual_query?.trim() ||
    [...(intent.objects ?? []), ...(intent.scenes ?? [])].join(" / ") ||
    intent.qualities?.slice(0, 4).join(" / ");
  return label?.trim() || null;
}

export function isConfirmMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(yes|yep|yeah|yea|ok|okay|sure|please|confirm|go ahead|do it|create it|make it|looks good|that works|perfect|sí|si|oui|ja|sim|はい|네|예|sì|sí\.?|confirmar|confirme|d'accord|vale)\b/i.test(
    t,
  );
}

export function isCancelMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no|nope|cancel|stop|nevermind|never mind|don't|dont|non|nein|não|nao|いいえ|아니|annuler|cancelar|annulla|annuleren)\b/i.test(
    t,
  );
}

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
      visualLabeledTotal: 0,
      visualUnlabeledTotal: 0,
      lowVisualCoverage: false,
      visualLabeledRatio: 0,
      withPeopleOnly: null,
      withDateOnly: null,
      peopleWithoutFaces: [],
      dateFilterApplied: false,
      dateFilterConcrete: false,
      textHintsApplied: false,
      peopleMatch: "any",
      peopleIdCount: 0,
      searchMode: "browse",
    },
  };
}

/**
 * Object/scene asks must search visual labels — never stall on People clarify.
 */
function preferVisualSearchOverPersonClarify(
  resolved: ResolvedIntent,
  intentKind: ReturnType<typeof classifyAskIntent>,
): ResolvedIntent {
  if (intentKind !== "object_search" && intentKind !== "scene_search") {
    return resolved;
  }

  const hasVisual =
    Boolean(resolved.intent.visual_query?.trim()) ||
    (resolved.intent.objects?.length ?? 0) > 0 ||
    (resolved.intent.scenes?.length ?? 0) > 0 ||
    (resolved.intent.qualities?.length ?? 0) > 0;

  if (!hasVisual && resolved.matchedPeople.length > 0) {
    return resolved;
  }

  const clarifyingQuestions = resolved.clarifyingQuestions.filter(
    (q) =>
      !/couldn'?t find anyone named/i.test(q) &&
      !/couldn'?t match .+ to people/i.test(q) &&
      !/matches more than one person/i.test(q) &&
      !/which person did you mean/i.test(q) &&
      !/who did you mean/i.test(q),
  );

  return {
    ...resolved,
    peopleIds: [],
    matchedPeople: [],
    unresolvedPeople: [],
    needsClarification: clarifyingQuestions.length > 0,
    clarifyingQuestions,
    intent: {
      ...resolved.intent,
      people: [],
      action:
        resolved.intent.action === "clarify" ? "search_media" : resolved.intent.action,
      clarifying_questions:
        clarifyingQuestions.length > 0 ? clarifyingQuestions : undefined,
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
