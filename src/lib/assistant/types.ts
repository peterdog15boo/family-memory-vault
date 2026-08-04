/**
 * Natural-language assistant contracts.
 *
 * These types are the shared language between intent parsing, conversation
 * persistence, and future action executors (create memory / movie / search).
 */

/* -------------------------------------------------------------------------- */
/* Intent                                                                      */
/* -------------------------------------------------------------------------- */

export const ASSISTANT_ACTIONS = [
  "create_memory",
  "create_movie",
  "search_media",
  "create_document_category",
  "file_private_document",
  "add_legacy_contact",
  "draft_legacy_business",
  "review_legacy_checklist",
  "answer_help",
  "clarify",
] as const;

export type AssistantActionType = (typeof ASSISTANT_ACTIONS)[number];

export const ASSISTANT_TONES = [
  "memorial",
  "birthday",
  "celebration",
  "humor",
  "cinematic",
  "simple",
] as const;

export type AssistantTone = (typeof ASSISTANT_TONES)[number];

/** Parsed calendar window extracted from a prompt (ISO dates preferred). */
export type AssistantDateRange = {
  start?: string;
  end?: string;
  /** Human label such as "last summer" or "Christmas 2023". */
  label?: string;
};

/**
 * Structured intent produced from a user prompt.
 * `raw_prompt` is always the original text; other fields are best-effort parses.
 */
export type AssistantIntent = {
  action: AssistantActionType;
  people: string[];
  date_range?: AssistantDateRange;
  tone?: AssistantTone;
  qualities?: string[];
  /**
   * Natural-language visual / object / scene search phrase.
   * Example: "inflatable obstacle courses", "birthday cake", "beach sunset".
   */
  visual_query?: string;
  /** Concrete objects the user asked for (bounce house, cake, dog, …). */
  objects?: string[];
  /** Scene / setting labels (beach, playground, wedding, …). */
  scenes?: string[];
  /**
   * Whether to search photos, videos, or both.
   * Default / omitted → both (e.g. "show me Jeff").
   */
  media_preference?: "photos" | "videos" | "both";
  /** Maps loosely to movie theme keys (simple, holiday, cinematic, …). */
  theme_preference?: string;
  title_suggestion?: string;
  /** Private Documents helpers. */
  document_title?: string;
  document_category?: string;
  document_category_description?: string;
  /** Digital Legacy helpers. */
  legacy_contact_name?: string;
  legacy_contact_category?: string;
  legacy_contact_email?: string;
  legacy_contact_phone?: string;
  legacy_contact_relationship?: string;
  legacy_instruction_section?: string;
  legacy_instruction_title?: string;
  legacy_instruction_content?: string;
  /** Present when action is "clarify" or confidence is low. */
  clarifying_questions?: string[];
  /** 0–1 model/parser confidence; optional for rule-based parsers. */
  confidence?: number;
  raw_prompt: string;
};

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

export const ASSISTANT_MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export type AssistantMessageRole = (typeof ASSISTANT_MESSAGE_ROLES)[number];

/** Flexible metadata stored on each chat turn. */
export type AssistantMessageMetadata = {
  intent?: AssistantIntent;
  /** Linked assistant_actions rows created from this turn. */
  actionIds?: string[];
  mediaIds?: string[];
  model?: string;
  tokens?: {
    prompt?: number;
    completion?: number;
  };
  error?: string;
  /** Multi-turn draft awaiting clarification or user confirmation. */
  pendingProposal?: AssistantPendingProposal | null;
  [key: string]: unknown;
};

/** Draft stored on assistant messages for preview / clarify turns. */
export type AssistantPendingProposal = {
  id: string;
  status: "open" | "consumed" | "cancelled";
  stage: "clarify" | "preview";
  intent: AssistantIntent;
  peopleIds: string[];
  matchedPeople: Array<{
    id: string;
    name: string;
    matchedOn: string;
    score: number;
  }>;
  unresolvedPeople: Array<{
    query: string;
    reason: "not_found" | "ambiguous";
    candidates: Array<{ id: string; name: string; score: number }>;
  }>;
  dateFilter: {
    label?: string;
    start?: string;
    end?: string;
    isConcrete: boolean;
    resolutionNote?: string;
  } | null;
  clarifyingQuestions: string[];
  mediaIds: string[];
  totalCount: number;
  sampleThumbnails: Array<{
    mediaId: string;
    previewUrl: string | null;
    type?: "photo" | "video";
  }>;
  titleSuggestion?: string;
  themePreference?: string;
  createdAt: string;
};

/** Domain message shape (mirrors DB row; dates are Date at runtime). */
export type AssistantMessage = {
  id: string;
  conversationId: string;
  role: AssistantMessageRole;
  content: string;
  metadata: AssistantMessageMetadata;
  createdAt: Date;
};

export type AssistantConversation = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/* -------------------------------------------------------------------------- */
/* Actions & results                                                           */
/* -------------------------------------------------------------------------- */

export const ASSISTANT_ACTION_STATUSES = [
  "pending",
  "succeeded",
  "failed",
  "needs_clarification",
] as const;

export type AssistantActionStatus = (typeof ASSISTANT_ACTION_STATUSES)[number];

/** Discriminated outcomes for executed assistant intents. */
export type AssistantActionResult =
  | {
      type: "create_memory";
      memoryId: string;
      mediaIds?: string[];
      title?: string;
    }
  | {
      type: "create_movie";
      movieId: string;
      memoryId: string;
      title?: string;
    }
  | {
      type: "search_media";
      mediaIds: string[];
      count: number;
    }
  | {
      type: "create_document_category";
      categoryId: string;
      name: string;
      slug: string;
    }
  | {
      type: "file_private_document";
      documentId: string;
      documentTitle: string;
      categoryId: string;
      categoryName: string;
    }
  | {
      type: "add_legacy_contact";
      contactId: string;
      name: string;
      category: string;
    }
  | {
      type: "draft_legacy_business";
      instructionIds: string[];
      title: string;
      sectionTypes: string[];
    }
  | {
      type: "review_legacy_checklist";
      completed: number;
      total: number;
      missing: Array<{
        id: string;
        label: string;
        href: string;
      }>;
    }
  | {
      type: "answer_help";
      topicIds: string[];
      links: Array<{ label: string; href: string }>;
    }
  | {
      type: "clarify";
      questions: string[];
    }
  | {
      type: "error";
      message: string;
      code?: string;
    };

export type AssistantActionRecord = {
  id: string;
  conversationId: string;
  messageId: string | null;
  userId: string;
  actionType: AssistantActionType;
  status: AssistantActionStatus;
  intent: AssistantIntent | null;
  result: AssistantActionResult | null;
  error: string | null;
  createdAt: Date;
};
