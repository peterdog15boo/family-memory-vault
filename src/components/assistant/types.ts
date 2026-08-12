/**
 * Client types mirroring /api/assistant turn payloads.
 */

import type { TranslateFn } from "@/lib/i18n";

export type AssistantUnderstandingView = {
  action: string;
  people: string[];
  dateRange?: { start?: string; end?: string; label?: string };
  tone?: string;
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

export type AssistantActionButtonView = {
  id: string;
  label: string;
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
  href?: string;
  mediaIds?: string[];
};

export type AssistantTurnView = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: "clarify" | "preview" | "completed" | "cancelled" | "failed";
  assistantText: string;
  understanding: AssistantUnderstandingView | null;
  clarifyingQuestions: string[];
  mediaPreview: {
    proposalId?: string;
    action?: string;
    totalCount: number;
    mediaIds: string[];
    thumbnails: Array<{
      mediaId: string;
      previewUrl: string | null;
      type?: "photo" | "video";
    }>;
    people: Array<{ id: string; name: string }>;
    dateLabel?: string;
    title?: string;
    theme?: string;
    summary?: string;
  } | null;
  actionButtons: AssistantActionButtonView[];
  created: {
    memoryId: string | null;
    movieId: string | null;
    mediaIds: string[];
    links: Array<{ label: string; href: string }>;
  };
  result: unknown;
  actionId: string | null;
};

export type AssistantChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Present on assistant bubbles that came from a turn response. */
  turn?: AssistantTurnView;
};

export const ASSISTANT_EXAMPLE_PROMPT_KEYS = [
  "assistant.examples.beach",
  "assistant.examples.invite",
  "assistant.examples.cake",
  "assistant.examples.createMemory",
  "assistant.examples.slideshow",
  "assistant.examples.moreMovies",
] as const;

/** @deprecated Prefer ASSISTANT_EXAMPLE_PROMPT_KEYS + t() */
export const ASSISTANT_EXAMPLE_PROMPTS = [
  "Show me beach photos",
  "How do I invite family members?",
  "Photos with birthday cake",
  "Where do I create a Memory?",
  "Create a slideshow of summer photos",
  "How can I make more movies this month?",
] as const;

export function getAssistantExamplePrompts(t: TranslateFn): string[] {
  return ASSISTANT_EXAMPLE_PROMPT_KEYS.map((key) => t(key));
}
