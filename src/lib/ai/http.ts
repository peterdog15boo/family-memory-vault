/**
 * HTTP helpers for assistant API routes — UI-friendly serialization.
 */

import { NextResponse } from "next/server";
import type {
  AssistantConversationRow,
  AssistantMessageRow,
} from "@/lib/db/schema";
import type {
  AssistantIntent,
  AssistantPendingProposal,
} from "@/lib/assistant/types";
import type {
  AssistantUiPreview,
  AssistantUiResponse,
} from "@/lib/ai/assistant";
import { publicAssistantErrorMessage } from "@/lib/ai/safety";
import { LogEvents, logAssistantFailed } from "@/lib/observability/events";

/* -------------------------------------------------------------------------- */
/* Action buttons                                                              */
/* -------------------------------------------------------------------------- */

export type AssistantActionButton = {
  id: string;
  label: string;
  /** Client-side action kind. */
  action:
    | "confirm"
    | "cancel"
    | "view_memory"
    | "view_movie"
    | "browse_media"
    | "create_memory_from_search"
    | "create_movie_from_search"
    | "open_documents"
    | "open_legacy"
    | "open_help_route";
  proposalId?: string;
  conversationId?: string;
  /** In-app path when the button is a navigation link. */
  href?: string;
  /** Media IDs for create_memory_from_search. */
  mediaIds?: string[];
};

export type AssistantUnderstanding = {
  action: AssistantIntent["action"];
  people: string[];
  dateRange?: AssistantIntent["date_range"];
  tone?: AssistantIntent["tone"];
  qualities?: string[];
  visualQuery?: string;
  objects?: string[];
  scenes?: string[];
  themePreference?: string;
  titleSuggestion?: string;
  documentTitle?: string;
  documentCategory?: string;
  legacyContactName?: string;
  legacyContactCategory?: string;
  legacyInstructionTitle?: string;
  confidence?: number;
};

export type AssistantCreatedLinks = {
  memoryId: string | null;
  movieId: string | null;
  mediaIds: string[];
  links: Array<{ label: string; href: string }>;
};

export type AssistantTurnApiPayload = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: AssistantUiResponse["status"];
  /** Primary assistant text for the chat bubble. */
  assistantText: string;
  /** Structured parse the UI can show as “Understanding”. */
  understanding: AssistantUnderstanding | null;
  clarifyingQuestions: string[];
  mediaPreview: {
    proposalId?: string;
    action?: AssistantUiPreview["action"];
    totalCount: number;
    mediaIds: string[];
    thumbnails: Array<{ mediaId: string; previewUrl: string | null }>;
    people: Array<{ id: string; name: string }>;
    dateLabel?: string;
    title?: string;
    theme?: string;
    summary?: string;
  } | null;
  actionButtons: AssistantActionButton[];
  created: AssistantCreatedLinks;
  result: AssistantUiResponse["result"] | null;
  actionId: string | null;
};

/* -------------------------------------------------------------------------- */
/* Serializers                                                                 */
/* -------------------------------------------------------------------------- */

export function serializeConversation(row: AssistantConversationRow) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeMessage(row: AssistantMessageRow) {
  const pending = row.metadata?.pendingProposal as
    | AssistantPendingProposal
    | null
    | undefined;
  const searchPreview = row.metadata?.searchPreview as
    | {
        totalCount: number;
        mediaIds: string[];
        sampleThumbnails: Array<{
          mediaId: string;
          previewUrl: string | null;
          type?: "photo" | "video";
        }>;
        people: Array<{ id: string; name: string }>;
        dateLabel?: string;
      }
    | null
    | undefined;

  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    metadata: {
      intent: row.metadata?.intent ?? null,
      actionIds: row.metadata?.actionIds ?? [],
      mediaIds: row.metadata?.mediaIds ?? [],
      pendingProposal: pending
        ? {
            id: pending.id,
            status: pending.status,
            stage: pending.stage,
            totalCount: pending.totalCount,
            titleSuggestion: pending.titleSuggestion ?? null,
            themePreference: pending.themePreference ?? null,
            mediaIds: pending.mediaIds,
            sampleThumbnails: pending.sampleThumbnails,
            clarifyingQuestions: pending.clarifyingQuestions,
          }
        : null,
      searchPreview: searchPreview ?? null,
      error: row.metadata?.error ?? null,
    },
  };
}

export function serializeUnderstanding(
  intent: AssistantIntent | undefined,
): AssistantUnderstanding | null {
  if (!intent) return null;
  return {
    action: intent.action,
    people: intent.people,
    dateRange: intent.date_range,
    tone: intent.tone,
    qualities: intent.qualities,
    visualQuery: intent.visual_query,
    objects: intent.objects,
    scenes: intent.scenes,
    themePreference: intent.theme_preference,
    titleSuggestion: intent.title_suggestion,
    documentTitle: intent.document_title,
    documentCategory: intent.document_category,
    legacyContactName: intent.legacy_contact_name,
    legacyContactCategory: intent.legacy_contact_category,
    legacyInstructionTitle: intent.legacy_instruction_title,
    confidence: intent.confidence,
  };
}

export function buildActionButtons(
  turn: AssistantUiResponse,
): AssistantActionButton[] {
  const buttons: AssistantActionButton[] = [];

  if (turn.status === "preview" && turn.preview) {
    const confirmLabel = previewConfirmLabel(turn.preview.action);
    buttons.push({
      id: `confirm-${turn.preview.proposalId}`,
      label: confirmLabel,
      action: "confirm",
      proposalId: turn.preview.proposalId,
      conversationId: turn.conversationId,
    });
    buttons.push({
      id: `cancel-${turn.preview.proposalId}`,
      label: "Not now",
      action: "cancel",
      proposalId: turn.preview.proposalId,
      conversationId: turn.conversationId,
    });
  }

  if (turn.entities?.memoryId) {
    buttons.push({
      id: `memory-${turn.entities.memoryId}`,
      label: "View Memory",
      action: "view_memory",
      href: `/memories/${turn.entities.memoryId}`,
    });
  }

  if (turn.entities?.movieId) {
    buttons.push({
      id: `movie-${turn.entities.movieId}`,
      label: "View Movie",
      action: "view_movie",
      href: `/movies`,
    });
  }

  if (
    turn.status === "completed" &&
    turn.result?.type === "search_media" &&
    turn.result.count > 0
  ) {
    const mediaIds =
      turn.result.mediaIds.length > 0
        ? turn.result.mediaIds
        : (turn.preview?.mediaIds ?? turn.entities?.mediaIds ?? []);
    if (mediaIds.length > 0) {
      buttons.push({
        id: "create-memory-from-search",
        label: "Create Memory",
        action: "create_memory_from_search",
        conversationId: turn.conversationId,
        mediaIds,
      });
      buttons.push({
        id: "create-movie-from-search",
        label: "Create Movie",
        action: "create_movie_from_search",
        conversationId: turn.conversationId,
        mediaIds,
      });
    }

    const matchedPeople = turn.preview?.people ?? [];
    if (matchedPeople.length === 1 && matchedPeople[0]) {
      const person = matchedPeople[0];
      buttons.push({
        id: `person-${person.id}`,
        label: `View ${person.name}'s media`,
        action: "browse_media",
        href: `/people/${person.id}`,
      });
    } else if (matchedPeople.length > 1) {
      for (const person of matchedPeople.slice(0, 3)) {
        buttons.push({
          id: `person-${person.id}`,
          label: `View ${person.name}`,
          action: "browse_media",
          href: `/people/${person.id}`,
        });
      }
    } else {
      buttons.push({
        id: "browse-media",
        label: "View library",
        action: "browse_media",
        href: "/media",
      });
    }
  }

  if (turn.status === "completed" && turn.result?.type === "create_document_category") {
    buttons.push({
      id: "open-documents",
      label: "Open documents",
      action: "open_documents",
      href: "/documents",
    });
  }

  if (turn.status === "completed" && turn.result?.type === "file_private_document") {
    buttons.push({
      id: "open-documents-filed",
      label: "Open documents",
      action: "open_documents",
      href: "/documents",
    });
  }

  if (
    turn.status === "completed" &&
    (turn.result?.type === "add_legacy_contact" ||
      turn.result?.type === "draft_legacy_business" ||
      turn.result?.type === "review_legacy_checklist")
  ) {
    buttons.push({
      id: "open-legacy",
      label: "Open Digital Legacy",
      action: "open_legacy",
      href: "/documents/legacy",
    });
  }

  if (turn.status === "completed" && turn.result?.type === "answer_help") {
    for (const link of turn.result.links.slice(0, 4)) {
      buttons.push({
        id: `help-${link.href.replace(/\W+/g, "-")}`,
        label: friendlyHelpLinkLabel(link.label, link.href),
        action: "open_help_route",
        href: link.href,
      });
    }
  }

  return buttons;
}

function friendlyHelpLinkLabel(label: string, href: string): string {
  if (/\/family/i.test(href)) return "Go to Family";
  if (/\/billing|\/pricing/i.test(href)) return "Upgrade / Billing";
  if (/\/media/i.test(href)) return "View library";
  if (/\/memories/i.test(href)) return "Go to Memories";
  if (/\/movies/i.test(href)) return "Go to Movies";
  if (/\/settings/i.test(href)) return "Open Settings";
  if (/\/documents\/legacy/i.test(href)) return "Digital Legacy";
  if (/\/documents/i.test(href)) return "Go to Documents";
  if (/\/upload/i.test(href)) return "Go to Upload";
  if (/\/people/i.test(href)) return "Go to People";
  return label;
}

export function buildCreatedLinks(
  turn: AssistantUiResponse,
): AssistantCreatedLinks {
  const memoryId = turn.entities?.memoryId ?? null;
  const movieId = turn.entities?.movieId ?? null;
  const mediaIds = turn.entities?.mediaIds ?? turn.preview?.mediaIds ?? [];
  const links: Array<{ label: string; href: string }> = [];

  if (memoryId) {
    links.push({ label: "Memory", href: `/memories/${memoryId}` });
  }
  if (movieId) {
    links.push({ label: "Movies", href: "/movies" });
  }
  if (turn.result?.type === "create_document_category") {
    links.push({ label: "Private Documents", href: "/documents" });
  }
  if (turn.result?.type === "file_private_document") {
    links.push({ label: "Private Documents", href: "/documents" });
  }
  if (
    turn.result?.type === "add_legacy_contact" ||
    turn.result?.type === "draft_legacy_business" ||
    turn.result?.type === "review_legacy_checklist"
  ) {
    links.push({ label: "Digital Legacy", href: "/documents/legacy" });
  }
  if (turn.result?.type === "answer_help") {
    for (const link of turn.result.links) {
      if (!links.some((l) => l.href === link.href)) {
        links.push(link);
      }
    }
  }

  return { memoryId, movieId, mediaIds, links };
}

export function toAssistantTurnApiPayload(
  turn: AssistantUiResponse,
): AssistantTurnApiPayload {
  const preview = turn.preview
    ? serializeMediaPreview(turn.preview)
    : null;

  return {
    conversationId: turn.conversationId,
    userMessageId: turn.userMessageId,
    assistantMessageId: turn.assistantMessageId,
    status: turn.status,
    assistantText: turn.message,
    understanding: serializeUnderstanding(turn.intent),
    clarifyingQuestions: turn.clarifyingQuestions ?? [],
    mediaPreview: preview,
    actionButtons: buildActionButtons(turn),
    created: buildCreatedLinks(turn),
    result: turn.result ?? null,
    actionId: turn.actionId ?? null,
  };
}

function serializeMediaPreview(preview: AssistantUiPreview) {
  return {
    proposalId: preview.proposalId,
    action: preview.action,
    totalCount: preview.totalCount,
    mediaIds: preview.mediaIds,
    thumbnails: preview.thumbnails,
    people: preview.people,
    dateLabel: preview.dateLabel,
    title: preview.title,
    theme: preview.theme,
    summary: preview.summary,
  };
}

function previewConfirmLabel(action: AssistantUiPreview["action"]): string {
  switch (action) {
    case "create_movie":
      return "Create slideshow";
    case "create_memory":
      return "Create memory";
    case "create_document_category":
      return "Create category";
    case "file_private_document":
      return "File document";
    case "add_legacy_contact":
      return "Add contact";
    case "draft_legacy_business":
      return "Save draft";
    default:
      return "Confirm";
  }
}

export function assistantApiErrorResponse(
  error: unknown,
  fallback = "Assistant request failed",
): NextResponse {
  logAssistantFailed(
    {
      event: LogEvents.assistantFailed,
      surface: "api",
      fallback,
    },
    error,
  );

  return NextResponse.json(
    { error: publicAssistantErrorMessage(error) || fallback },
    {
      status:
        error instanceof Error && error.message.toLowerCase().includes("not found")
          ? 404
          : 500,
    },
  );
}
