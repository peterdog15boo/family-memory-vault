/**
 * Intent parsing for the natural-language assistant.
 *
 * Examples the parser should handle:
 *
 *   "Create a slideshow of Noah images from 7th grade"
 *   → action: create_movie, people: ["Noah"], date_range.label: "7th grade"
 *
 *   "Create a memorial tribute for Craig highlighting his humor and depth"
 *   → action: create_movie, people: ["Craig"], tone: memorial,
 *     qualities: ["humor", "depth"], theme_preference: "cinematic"
 *
 *   "Show me photos of Grandpa fishing"
 *   → action: search_media, people: ["Grandpa"], qualities: ["fishing"]
 *
 * People names extracted here are *candidates*. Downstream matching must
 * resolve them against the user's People identities and must never invent
 * identities that do not exist in the account.
 */

import { z } from "zod";
import {
  ASSISTANT_ACTIONS,
  ASSISTANT_TONES,
  type AssistantActionType,
  type AssistantDateRange,
  type AssistantIntent,
  type AssistantTone,
} from "@/lib/assistant/types";
import {
  completeChatJson,
  isLlmConfigured,
  type ChatJsonCompleter,
} from "@/lib/ai/llm";
import { shouldOverrideWithProductHelp, isMixedHelpAndMediaRequest } from "@/lib/ai/help";
import {
  detectMediaPreference,
} from "@/lib/ai/media-preference";
import { intentLocalePromptSuffix } from "@/lib/ai/locale";
import type { AppLocale } from "@/lib/i18n";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";

/* -------------------------------------------------------------------------- */
/* Public options                                                              */
/* -------------------------------------------------------------------------- */

export type ParseIntentOptions = {
  /**
   * Optional known people display names from the user's account.
   * When provided, extracted names are matched against this list (case-insensitive /
   * substring). Unmatched mentions are kept as candidates for clarify, never invented.
   */
  knownPeople?: string[];
  /** Force heuristic path (useful in tests / offline). */
  preferFallback?: boolean;
  /** Inject a completer (tests / alternate providers). */
  llmComplete?: ChatJsonCompleter;
  /** Reference "now" for relative phrases like "last summer". */
  now?: Date;
  /** Abort signal for the LLM call. */
  signal?: AbortSignal;
  /** UI locale — guides clarifying questions + English visual-term normalization. */
  locale?: AppLocale;
};

export type ParseIntentMeta = {
  source: "llm" | "fallback";
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
};

export type ParseIntentResult = AssistantIntent & {
  /** Parser provenance — not persisted unless callers choose to. */
  _meta?: ParseIntentMeta;
};

/* -------------------------------------------------------------------------- */
/* Zod schema (LLM structured output)                                          */
/* -------------------------------------------------------------------------- */

const dateRangeSchema = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
    label: z.string().optional(),
  })
  .strict()
  .optional();

const llmIntentSchema = z
  .object({
    action: z.enum(ASSISTANT_ACTIONS),
    people: z.array(z.string()).default([]),
    date_range: dateRangeSchema,
    tone: z.enum(ASSISTANT_TONES).optional().nullable(),
    qualities: z.array(z.string()).optional().nullable(),
    visual_query: z.string().optional().nullable(),
    objects: z.array(z.string()).optional().nullable(),
    scenes: z.array(z.string()).optional().nullable(),
    media_preference: z.enum(["photos", "videos", "both"]).optional().nullable(),
    theme_preference: z.string().optional().nullable(),
    title_suggestion: z.string().optional().nullable(),
    document_title: z.string().optional().nullable(),
    document_category: z.string().optional().nullable(),
    document_category_description: z.string().optional().nullable(),
    legacy_contact_name: z.string().optional().nullable(),
    legacy_contact_category: z.string().optional().nullable(),
    legacy_contact_email: z.string().optional().nullable(),
    legacy_contact_phone: z.string().optional().nullable(),
    legacy_contact_relationship: z.string().optional().nullable(),
    legacy_instruction_section: z.string().optional().nullable(),
    legacy_instruction_title: z.string().optional().nullable(),
    legacy_instruction_content: z.string().optional().nullable(),
    clarifying_questions: z.array(z.string()).optional().nullable(),
    confidence: z.number().min(0).max(1).optional().nullable(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/* Prompts                                                                     */
/* -------------------------------------------------------------------------- */

export const INTENT_SYSTEM_PROMPT = `You are an intent parser for Family Memory Vault, a private family photo/video app.

Convert the user's request into a single JSON object with this exact shape:
{
  "action": "create_memory" | "create_movie" | "search_media" | "create_document_category" | "file_private_document" | "add_legacy_contact" | "draft_legacy_business" | "review_legacy_checklist" | "answer_help" | "clarify",
  "people": string[],
  "date_range": { "start"?: string, "end"?: string, "label"?: string },
  "tone": "memorial" | "birthday" | "celebration" | "humor" | "cinematic" | "simple" | null,
  "qualities": string[] | null,
  "visual_query": string | null,
  "objects": string[] | null,
  "scenes": string[] | null,
  "media_preference": "photos" | "videos" | "both" | null,
  "theme_preference": string | null,
  "title_suggestion": string | null,
  "document_title": string | null,
  "document_category": string | null,
  "document_category_description": string | null,
  "legacy_contact_name": string | null,
  "legacy_contact_category": string | null,
  "legacy_contact_email": string | null,
  "legacy_contact_phone": string | null,
  "legacy_contact_relationship": string | null,
  "legacy_instruction_section": string | null,
  "legacy_instruction_title": string | null,
  "legacy_instruction_content": string | null,
  "clarifying_questions": string[] | null,
  "confidence": number
}

Rules:
- action "create_movie": slideshows, movies, montages, video tributes, cinematic stories.
- action "create_memory": albums, collections, memory pages (not necessarily a rendered video).
- action "search_media": browse/find/show photos or videos without creating something new.
- media_preference: "photos" when the user only asked for photos/pictures/images; "videos" when only videos/clips/footage; "both" for "photos and videos", "media", or when they did not specify (e.g. "show me Jeff"). Do not use "videos" just because they said "movie" for create_movie.
- action "create_document_category": create a private document category for the current user only.
- action "file_private_document": move or file one of the user's private documents into a private category. If the user says "this PDF" or "this document" but no specific document is available in the text, prefer clarify.
- action "add_legacy_contact": add an owner-only Digital Legacy contact such as attorney, executor, insurance agent, accountant, business partner, or family helper.
- action "draft_legacy_business": draft or save business continuity / transition guidance in Digital Legacy. Prefer drafting helpful starter text rather than encouraging password storage.
- action "review_legacy_checklist": answer what is still missing from the user's Digital Legacy checklist. Read-only.
- action "answer_help": product how-to / settings / plan-limit questions about using Family Memory Vault (invite family, upload photos, create a Memory, movie limits, Digital Legacy overview, change avatar, theme, billing). Do NOT use photo search. Prefer this for "how do I…", "where can I…", "why don't…", "how can I make more than N movies".
- action "clarify": ambiguous, missing critical info, or conflicting instructions. Include clarifying_questions.
- people: ONLY proper names or kinship labels the user explicitly mentioned (e.g. "Noah", "Scott", "Grandpa"). NEVER invent people. NEVER put objects, activities, props, places, demographics, or generic roles in people (cigar, suit, tie, fishing, beach, indoors, person, someone, man, men, woman, women, boy, girl, gentlemen).
- For private-documents / legacy actions, use the dedicated fields instead of overloading people/qualities.
- legacy_contact_category should be one of: attorney, insurance_agent, accountant, executor, business_partner, family, other.
- legacy_instruction_section should usually be "business_operations" or "survivors_guidance" for legacy business drafting.
- Never suggest storing passwords or secrets casually. Secure-item requests should not be turned into general drafting or filing actions.
- If the user describes a scene, object, setting, or people-category without naming someone ("photos of cigars", "show me suits", "photos taken indoors", "show me men", "images with inflatable obstacle courses"), leave people empty. Put the visual ask in visual_query and split concrete nouns into objects/scenes (include indoors/outdoors/beach as scenes; man/woman/boy/girl as objects when asked). Prefer action "search_media". Do NOT ask who is in the photo unless the user mentioned a proper name.
- "photos of Scott" (a person name) → people:["Scott"], not an object search.
- date_range.label: keep human phrases ("7th grade", "last summer", "Christmas 2024"). Prefer ISO start/end when a year or clear range is known.
- tone: map tribute/memorial → memorial; funny/humorous → humor; party/celebration → celebration.
- qualities: traits, activities, or visual subjects (humor, depth, cigar, suit, tie, indoors, …) — never duplicate these into people.
- visual_query: natural phrase for object/scene search ("cigars", "suits", "indoors", "beach photos", "inflatable obstacle courses").
- objects / scenes: concrete searchable nouns (cigar, suit, tie, bounce house, cake / beach, indoors, outdoors, playground, wedding).
- theme_preference: when implied, use one of: simple, holiday, cinematic, vintage, bright, birthday.
- confidence: 0–1. If confidence < 0.55, prefer action "clarify".
- Return JSON only. No markdown.`;

export function buildIntentSystemPrompt(locale: AppLocale = DEFAULT_LOCALE): string {
  return `${INTENT_SYSTEM_PROMPT}${intentLocalePromptSuffix(locale)}`;
}

export const INTENT_FEW_SHOT_USER = `Examples (for your reasoning only — respond with JSON for the final user request alone):

1) "Create a slideshow of Noah images from 7th grade"
→ {"action":"create_movie","people":["Noah"],"date_range":{"label":"7th grade"},"tone":"simple","qualities":null,"theme_preference":"simple","title_suggestion":"Noah — 7th Grade","clarifying_questions":null,"confidence":0.9}

2) "Create a memorial tribute for Craig highlighting his humor and depth"
→ {"action":"create_movie","people":["Craig"],"date_range":null,"tone":"memorial","qualities":["humor","depth"],"theme_preference":"cinematic","title_suggestion":"In Memory of Craig","clarifying_questions":null,"confidence":0.92}

3) "Show me photos of Grandpa fishing"
→ {"action":"search_media","people":["Grandpa"],"date_range":null,"tone":null,"qualities":["fishing"],"theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.88}

4) "Show me a person smoking a cigar"
→ {"action":"search_media","people":[],"date_range":null,"tone":null,"qualities":["smoking","cigar"],"visual_query":"person smoking a cigar","objects":["cigar"],"scenes":null,"theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.86}

4b) "show me images with inflatable obstacle courses"
→ {"action":"search_media","people":[],"date_range":null,"tone":null,"qualities":["inflatable","obstacle course"],"visual_query":"inflatable obstacle courses","objects":["inflatable","obstacle course","bounce house"],"scenes":["playground"],"theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.9}

4c) "show me videos of Jeff"
→ {"action":"search_media","people":["Jeff"],"date_range":null,"tone":null,"qualities":null,"visual_query":null,"objects":null,"scenes":null,"media_preference":"videos","theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.9}

4d) "show me photos and videos of Jeff"
→ {"action":"search_media","people":["Jeff"],"date_range":null,"tone":null,"qualities":null,"visual_query":null,"objects":null,"scenes":null,"media_preference":"both","theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.9}

5) "Create a Contracts category and upload this document"
→ {"action":"create_document_category","people":[],"date_range":null,"tone":null,"qualities":null,"theme_preference":null,"title_suggestion":"Contracts","document_title":null,"document_category":"Contracts","document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.9}

6) "Add an attorney contact named Sarah for legacy planning"
→ {"action":"add_legacy_contact","people":[],"date_range":null,"tone":null,"qualities":null,"theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":"Sarah","legacy_contact_category":"attorney","legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":"legacy planning","legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.9}

7) "How do I invite family members to join?"
→ {"action":"answer_help","people":[],"date_range":null,"tone":null,"qualities":null,"theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.95}

8) "How can I make more than 5 movies per month?"
→ {"action":"answer_help","people":[],"date_range":null,"tone":null,"qualities":null,"theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.95}

9) "Where do I create a Memory?"
→ {"action":"answer_help","people":[],"date_range":null,"tone":null,"qualities":null,"theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.93}

10) "fotos de la playa"
→ {"action":"search_media","people":[],"date_range":null,"tone":null,"qualities":null,"visual_query":"beach photos","objects":null,"scenes":["beach"],"media_preference":"photos","theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.9}

11) "montre-moi des photos d'anniversaire"
→ {"action":"search_media","people":[],"date_range":null,"tone":null,"qualities":["birthday"],"visual_query":"birthday photos","objects":["cake"],"scenes":null,"media_preference":"photos","theme_preference":null,"title_suggestion":null,"document_title":null,"document_category":null,"document_category_description":null,"legacy_contact_name":null,"legacy_contact_category":null,"legacy_contact_email":null,"legacy_contact_phone":null,"legacy_contact_relationship":null,"legacy_instruction_section":null,"legacy_instruction_title":null,"legacy_instruction_content":null,"clarifying_questions":null,"confidence":0.88}`;

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Parse a natural-language request into structured assistant intent.
 * Uses an LLM with JSON mode when configured; otherwise a robust heuristic fallback.
 */
export async function parseIntent(
  prompt: string,
  options: ParseIntentOptions = {},
): Promise<ParseIntentResult> {
  const raw = prompt.trim();
  if (!raw) {
    const t = createTranslator(options.locale ?? DEFAULT_LOCALE);
    return finalizeIntent(
      {
        action: "clarify",
        people: [],
        raw_prompt: prompt,
        clarifying_questions: [t("assistant.reply.emptyPromptQuestion")],
        confidence: 0,
      },
      options,
      { source: "fallback" },
    );
  }

  const useLlm =
    !options.preferFallback &&
    (Boolean(options.llmComplete) || isLlmConfigured());

  if (useLlm) {
    try {
      const llmIntent = await parseIntentWithLlm(raw, options);
      return finalizeIntent(llmIntent, options, {
        source: "llm",
        model: llmIntent._model,
        usage: llmIntent._usage,
      });
    } catch {
      // Fall through to heuristics — never fail the assistant on LLM outage.
    }
  }

  const fallback = parseIntentFallback(raw, { now: options.now });
  return finalizeIntent(fallback, options, { source: "fallback" });
}

/* -------------------------------------------------------------------------- */
/* LLM path                                                                    */
/* -------------------------------------------------------------------------- */

type LlmParsed = AssistantIntent & {
  _model?: string;
  _usage?: ParseIntentMeta["usage"];
};

async function parseIntentWithLlm(
  prompt: string,
  options: ParseIntentOptions,
): Promise<LlmParsed> {
  const complete = options.llmComplete ?? completeChatJson;
  const knownHint =
    options.knownPeople && options.knownPeople.length > 0
      ? `\nKnown people in this account (prefer these spellings when matching mentions; do not invent others): ${options.knownPeople.join(", ")}`
      : "\nDo not invent people who were not mentioned.";

  const result = await complete({
    messages: [
      { role: "system", content: buildIntentSystemPrompt(options.locale) },
      { role: "user", content: INTENT_FEW_SHOT_USER },
      {
        role: "user",
        content: `User request:\n${prompt}${knownHint}\n\nRespond with JSON only.`,
      },
    ],
    temperature: 0,
    signal: options.signal,
  });

  const parsedJson = JSON.parse(result.content) as unknown;
  const parsed = llmIntentSchema.parse(parsedJson);

  return {
    action: parsed.action,
    people: parsed.people.map(cleanName).filter(Boolean),
    date_range: normalizeDateRange(parsed.date_range ?? undefined),
    tone: parsed.tone ?? undefined,
    qualities: cleanStringList(parsed.qualities),
    visual_query: parsed.visual_query?.trim() || undefined,
    objects: cleanStringList(parsed.objects),
    scenes: cleanStringList(parsed.scenes),
    media_preference:
      parsed.media_preference === "photos" ||
      parsed.media_preference === "videos" ||
      parsed.media_preference === "both"
        ? parsed.media_preference
        : undefined,
    theme_preference: parsed.theme_preference?.trim() || undefined,
    title_suggestion: parsed.title_suggestion?.trim() || undefined,
    document_title: parsed.document_title?.trim() || undefined,
    document_category: parsed.document_category?.trim() || undefined,
    document_category_description:
      parsed.document_category_description?.trim() || undefined,
    legacy_contact_name: parsed.legacy_contact_name?.trim() || undefined,
    legacy_contact_category: parsed.legacy_contact_category?.trim() || undefined,
    legacy_contact_email: parsed.legacy_contact_email?.trim() || undefined,
    legacy_contact_phone: parsed.legacy_contact_phone?.trim() || undefined,
    legacy_contact_relationship:
      parsed.legacy_contact_relationship?.trim() || undefined,
    legacy_instruction_section:
      parsed.legacy_instruction_section?.trim() || undefined,
    legacy_instruction_title: parsed.legacy_instruction_title?.trim() || undefined,
    legacy_instruction_content:
      parsed.legacy_instruction_content?.trim() || undefined,
    clarifying_questions: cleanStringList(parsed.clarifying_questions),
    confidence: parsed.confidence ?? undefined,
    raw_prompt: prompt,
    _model: result.model,
    _usage: result.usage,
  };
}

/* -------------------------------------------------------------------------- */
/* Fallback heuristic parser                                                   */
/* -------------------------------------------------------------------------- */

export type FallbackParseOptions = {
  now?: Date;
};

/**
 * Deterministic heuristic intent parser for simple / offline cases.
 * Exported for unit tests and as the LLM fallback.
 */
export function parseIntentFallback(
  prompt: string,
  options: FallbackParseOptions = {},
): AssistantIntent {
  const raw = prompt.trim();
  const lower = raw.toLowerCase();
  const now = options.now ?? new Date();

  const privateVaultIntent = parsePrivateVaultIntent(raw, lower);
  if (privateVaultIntent) {
    // How-to / overview questions about Digital Legacy should stay product help,
    // not checklist review — unless the user clearly asked about missing items.
    if (
      privateVaultIntent.action === "review_legacy_checklist" &&
      shouldOverrideWithProductHelp(privateVaultIntent)
    ) {
      return {
        action: "answer_help",
        people: [],
        confidence: 0.9,
        raw_prompt: raw,
      };
    }
    return privateVaultIntent;
  }

  if (shouldOverrideWithProductHelp({ action: "clarify", raw_prompt: raw })) {
    return {
      action: "answer_help",
      people: [],
      confidence: 0.9,
      raw_prompt: raw,
    };
  }

  // Mixed: find photos + how-to → search first; help tip is appended later.
  if (isMixedHelpAndMediaRequest(raw) && SEARCH_CUES.test(lower)) {
    const extractedPeople = extractPeople(raw);
    const scrubbed = scrubFalsePeople(raw, extractedPeople);
    const people = scrubbed.people;
    const date_range = extractDateRange(raw, now);
    const qualities = uniqueStrings([
      ...(extractQualities(raw, lower) ?? []),
      ...scrubbed.qualities,
    ]);
    const visual_query =
      extractVisualQuery(raw) ||
      (qualities.length ? qualities.join(" ") : undefined);
    const objects = uniqueStrings([
      ...scrubbed.qualities,
      ...(visual_query
        ? visual_query
            .split(/\s+/)
            .map((w) => w.replace(/[^a-z0-9-]/gi, ""))
            .filter((w) => w.length > 2)
        : []),
    ]);
    return {
      action: "search_media",
      people,
      date_range,
      qualities: qualities.length ? qualities : objects.length ? objects : undefined,
      visual_query: visual_query || undefined,
      objects: objects.length ? objects : undefined,
      confidence: 0.84,
      raw_prompt: raw,
    };
  }

  const action = detectAction(lower);
  const extractedPeople = extractPeople(raw);
  const scrubbed = scrubFalsePeople(raw, extractedPeople);
  const people = scrubbed.people;
  const date_range = extractDateRange(raw, now);
  const tone = detectTone(lower);
  const qualities = uniqueStrings([
    ...(extractQualities(raw, lower) ?? []),
    ...scrubbed.qualities,
  ]);
  const visual_query = extractVisualQuery(raw);
  const objects = uniqueStrings([
    ...scrubbed.qualities,
    ...(visual_query
      ? visual_query
          .split(/\s+/)
          .map((w) => w.replace(/[^a-z0-9-]/gi, ""))
          .filter((w) => w.length > 2)
      : []),
  ]);
  const theme_preference = detectTheme(lower, tone);
  const title_suggestion = suggestTitle({
    action,
    people,
    date_range,
    tone,
  });

  const questions = buildClarifyingQuestions({
    action,
    people,
    date_range,
    lower,
  });

  // Pure browse/show scene searches — keep search_media (do not invent people).
  // Create memory/movie keeps the create action and carries visual_query through.
  if (
    (action === "search_media" || action === "clarify") &&
    (Boolean(visual_query) ||
      (looksLikeSceneSearch(raw, people) && qualities.length > 0))
  ) {
    return {
      action: "search_media",
      people,
      date_range,
      tone,
      qualities: qualities.length ? qualities : objects.length ? objects : undefined,
      visual_query: visual_query || qualities.join(" ") || undefined,
      objects: objects.length ? objects : undefined,
      theme_preference,
      title_suggestion,
      confidence: 0.82,
      raw_prompt: raw,
    };
  }

  // Creates with a visual focus still need visual_query on the intent.
  if (
    (action === "create_memory" || action === "create_movie") &&
    (visual_query || objects.length > 0)
  ) {
    return {
      action,
      people,
      date_range,
      tone,
      qualities: qualities.length ? qualities : objects.length ? objects : undefined,
      visual_query: visual_query || objects.join(" ") || undefined,
      objects: objects.length ? objects : undefined,
      theme_preference,
      title_suggestion,
      clarifying_questions: questions.length ? questions : undefined,
      confidence: questions.length ? 0.55 : 0.8,
      raw_prompt: raw,
    };
  }

  if (questions.length > 0 || action === "clarify") {
    return {
      action: "clarify",
      people,
      date_range,
      tone,
      qualities: qualities.length ? qualities : undefined,
      visual_query,
      objects: objects.length ? objects : undefined,
      theme_preference,
      title_suggestion,
      clarifying_questions: questions.length
        ? uniqueStrings(questions)
        : [
            "Could you clarify whether you want to search photos, create a memory, or make a slideshow?",
          ],
      confidence: 0.35,
      raw_prompt: raw,
    };
  }

  const confidence = estimateConfidence({
    action,
    people,
    date_range,
    tone,
    qualities,
  });

  return {
    action,
    people,
    date_range,
    tone,
    qualities: qualities.length ? qualities : undefined,
    visual_query,
    objects: objects.length ? objects : undefined,
    theme_preference,
    title_suggestion,
    confidence,
    raw_prompt: raw,
  };
}

/* -------------------------------------------------------------------------- */
/* Action / tone / theme                                                       */
/* -------------------------------------------------------------------------- */

const MOVIE_CUES =
  /\b(slideshow|slide\s*show|movie|montage|video|film|reel|cinematic\s+stor(?:y|ies)|tribute\s+video)\b/i;
const MEMORY_CUES =
  /\b(memory|album|collection|scrapbook|gather|compile)\b/i;
const SEARCH_CUES =
  /\b(show\s+me|find|search|look\s+for|photos?\s+of|pictures?\s+of|images?\s+of|videos?\s+of)\b/i;
const CREATE_CUES = /\b(create|make|build|put\s+together|generate)\b/i;

function detectAction(lower: string): AssistantActionType {
  const wantsCreate = CREATE_CUES.test(lower);
  const movie = MOVIE_CUES.test(lower) || /\btribute\b/.test(lower);
  const memory = MEMORY_CUES.test(lower);
  const search = SEARCH_CUES.test(lower);

  // Explicit search without create → search
  if (search && !wantsCreate && !movie) {
    return "search_media";
  }

  if (movie && (wantsCreate || /\btribute\b/.test(lower) || /\bslideshow\b/.test(lower))) {
    return "create_movie";
  }

  if (memory && wantsCreate) {
    return "create_memory";
  }

  if (wantsCreate && movie) return "create_movie";
  if (wantsCreate && memory) return "create_memory";

  // "create a memorial tribute" without slideshow keyword
  if (wantsCreate && /\b(memorial|tribute|birthday)\b/.test(lower)) {
    return "create_movie";
  }

  if (search) return "search_media";

  // Soft create cues: "slideshow of X" without "create"
  if (movie) return "create_movie";

  return "clarify";
}

function detectTone(lower: string): AssistantTone | undefined {
  if (/\b(memorial|tribute|in\s+memory|remembrance|funeral|obituar)\b/.test(lower)) {
    return "memorial";
  }
  if (/\b(birthday|bday|turning\s+\d+)\b/.test(lower)) {
    return "birthday";
  }
  if (/\b(funny|humor|humour|hilarious|comedy|light[- ]?hearted)\b/.test(lower)) {
    return "humor";
  }
  if (/\b(celebration|party|anniversary|wedding|graduation)\b/.test(lower)) {
    return "celebration";
  }
  if (/\b(cinematic|film\s+look|movie\s+feel)\b/.test(lower)) {
    return "cinematic";
  }
  if (/\b(simple|clean|minimal)\b/.test(lower)) {
    return "simple";
  }
  return undefined;
}

function parsePrivateVaultIntent(
  raw: string,
  lower: string,
): AssistantIntent | null {
  const categoryName = extractDocumentCategoryName(raw);
  const contactName = extractNamedPerson(raw);
  const contactCategory = detectLegacyContactCategory(lower);
  const documentTitle = extractDocumentTitle(raw);

  if (
    /\b(digital legacy checklist|legacy checklist|what documents do i still need|what do i still need.*digital legacy|what.?s missing.*digital legacy)\b/i.test(
      raw,
    )
  ) {
    return {
      action: "review_legacy_checklist",
      people: [],
      raw_prompt: raw,
      confidence: 0.9,
    };
  }

  if (
    /\b(add|create)\b/.test(lower) &&
    /\b(contact)\b/.test(lower) &&
    /\b(attorney|insurance|accountant|executor|business partner|family)\b/.test(lower)
  ) {
    return {
      action: contactName ? "add_legacy_contact" : "clarify",
      people: [],
      legacy_contact_name: contactName ?? undefined,
      legacy_contact_category: contactCategory ?? undefined,
      legacy_contact_relationship:
        /legacy planning/i.test(raw) ? "legacy planning" : undefined,
      raw_prompt: raw,
      confidence: contactName ? 0.9 : 0.45,
      clarifying_questions: contactName
        ? undefined
        : ["Who would you like me to add as a legacy contact?"],
    };
  }

  if (
    /\b(business transition|business continuity|transition instructions)\b/.test(lower) ||
    (/\bdraft\b/.test(lower) &&
      /\b(business|transition|continuity)\b/.test(lower))
  ) {
    return {
      action: "draft_legacy_business",
      people: [],
      legacy_instruction_section: "business_operations",
      legacy_instruction_title: "Business transition plan",
      raw_prompt: raw,
      confidence: 0.88,
    };
  }

  if (
    /\bcall it\b/.test(lower) ||
    /\bname it\b/.test(lower) ||
    /\b(create|add)\b/.test(lower) &&
    /\bcategory\b/.test(lower) &&
    /\b(document|pdf|contract|insurance|tax|legal|medical|estate|records?)\b/.test(lower)
  ) {
    return {
      action: categoryName ? "create_document_category" : "clarify",
      people: [],
      document_category: categoryName ?? undefined,
      title_suggestion: categoryName ?? undefined,
      raw_prompt: raw,
      confidence: categoryName ? 0.92 : 0.42,
      clarifying_questions: categoryName
        ? undefined
        : ["What should I call the new private document category?"],
    };
  }

  if (
    /\b(file|categorize|move|put)\b/.test(lower) &&
    /\b(document|pdf)\b/.test(lower) &&
    /\bunder\b/.test(lower)
  ) {
    return {
      action:
        categoryName && documentTitle ? "file_private_document" : "clarify",
      people: [],
      document_title: documentTitle ?? undefined,
      document_category: categoryName ?? undefined,
      raw_prompt: raw,
      confidence: categoryName && documentTitle ? 0.84 : 0.4,
      clarifying_questions: buildPrivateVaultClarifyingQuestions({
        documentTitle,
        categoryName,
      }),
    };
  }

  return null;
}

function buildPrivateVaultClarifyingQuestions(input: {
  documentTitle: string | null;
  categoryName: string | null;
}): string[] | undefined {
  const questions: string[] = [];
  if (!input.documentTitle) {
    questions.push(
      "Which private document should I file? Please name the document title you want me to move.",
    );
  }
  if (!input.categoryName) {
    questions.push("Which private document category should I use?");
  }
  return questions.length ? questions : undefined;
}

function extractDocumentCategoryName(raw: string): string | null {
  const quoted = raw.match(/["“]([^"”]+)["”]\s+category/i);
  if (quoted?.[1]) return quoted[1].trim();
  const callIt = raw.match(/\b(?:call|name)\s+it\s+([A-Za-z][A-Za-z &'-]{1,80})$/i);
  if (callIt?.[1]) return toTitleLike(callIt[1]);
  const match = raw.match(/\b(?:create|add)\s+(?:a\s+new\s+|an?\s+)?(.+?)\s+category\b/i);
  if (match?.[1]) return toTitleLike(match[1]);
  const under = raw.match(/\bunder\s+([A-Za-z][A-Za-z &'-]{1,80})$/i);
  if (under?.[1]) return toTitleLike(under[1]);
  return null;
}

function extractDocumentTitle(raw: string): string | null {
  const quoted = raw.match(/["“]([^"”]+(?:\.pdf|\.docx?|\.txt)?)["”]/i);
  if (quoted?.[1]) return quoted[1].trim();
  const named = raw.match(/\b(?:document|pdf)\s+(?:named|called)\s+([A-Za-z0-9][^,.]{1,120})/i);
  if (named?.[1]) return named[1].trim();
  return null;
}

function extractNamedPerson(raw: string): string | null {
  const named = raw.match(
    /\bnamed\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)(?=\s+(?:for|with|as)\b|[,.]|$)/i,
  );
  if (named?.[1]) return titleCaseName(named[1]);
  return null;
}

function detectLegacyContactCategory(value: string): string | undefined {
  if (/\battorney|lawyer\b/.test(value)) return "attorney";
  if (/\binsurance\b/.test(value)) return "insurance_agent";
  if (/\baccountant|cpa\b/.test(value)) return "accountant";
  if (/\bexecutor\b/.test(value)) return "executor";
  if (/\bbusiness partner\b/.test(value)) return "business_partner";
  if (/\bfamily\b/.test(value)) return "family";
  return undefined;
}

function toTitleLike(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) =>
      /^(and|or|the|of|for|to)$/i.test(part)
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");
}

function detectTheme(
  lower: string,
  tone: AssistantTone | undefined,
): string | undefined {
  if (/\b(holiday|christmas|hanukkah|thanksgiving|xmas)\b/.test(lower)) {
    return "holiday";
  }
  if (/\b(vintage|retro|old[- ]?fashioned|film\s+grain)\b/.test(lower)) {
    return "vintage";
  }
  if (/\b(bright|airy|light\s+and\s+air)\b/.test(lower)) {
    return "bright";
  }
  if (/\b(cinematic|dramatic)\b/.test(lower) || tone === "cinematic") {
    return "cinematic";
  }
  if (tone === "memorial") return "cinematic";
  if (tone === "birthday") return "birthday";
  if (tone === "celebration") return "holiday";
  if (tone === "simple") return "simple";
  if (/\bslideshow\b/.test(lower)) return "simple";
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* People                                                                      */
/* -------------------------------------------------------------------------- */

const STOP_WORDS = new Set(
  [
    "a",
    "an",
    "the",
    "of",
    "for",
    "from",
    "to",
    "and",
    "or",
    "with",
    "his",
    "her",
    "their",
    "my",
    "our",
    "me",
    "us",
    "in",
    "on",
    "at",
    "by",
    "create",
    "make",
    "build",
    "show",
    "find",
    "search",
    "photos",
    "photo",
    "pictures",
    "picture",
    "images",
    "image",
    "videos",
    "video",
    "slideshow",
    "movie",
    "montage",
    "album",
    "memory",
    "memorial",
    "tribute",
    "highlighting",
    "highlight",
    "about",
    "last",
    "this",
    "that",
    "these",
    "those",
    "grade",
    "summer",
    "winter",
    "spring",
    "fall",
    "autumn",
    "christmas",
    "birthday",
    "celebration",
    "humor",
    "humour",
    "depth",
    "kindness",
    "fishing",
    "please",
    "want",
    "would",
    "like",
    "some",
    "all",
    "person",
    "people",
    "someone",
    "somebody",
    "anyone",
    "anybody",
    "man",
    "woman",
    "guy",
    "lady",
    "boy",
    "girl",
    "child",
    "kid",
    "kids",
    "cigar",
    "cigars",
    "cigarette",
    "cigarettes",
    "smoking",
  ].map((w) => w.toLowerCase()),
);

const KINSHIP =
  /\b(grandpa|grandma|grandfather|grandmother|papa|mama|mom|dad|mother|father|uncle|aunt|brother|sister|cousin|nana)\b/gi;

function titleCaseName(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function extractPeople(raw: string): string[] {
  const found: string[] = [];

  for (const match of raw.matchAll(KINSHIP)) {
    pushUnique(found, titleCaseName(match[1]!));
  }

  // "for Craig", "of Noah", "about Sarah" — case-insensitive
  for (const match of raw.matchAll(
    /\b(?:for|of|about)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?)\b/gi,
  )) {
    const name = match[1]!;
    if (
      !STOP_WORDS.has(name.toLowerCase()) &&
      !/^(grade|christmas|summer|winter|spring|fall|autumn)$/i.test(name) &&
      !isFalsePersonCandidate(name, raw)
    ) {
      pushUnique(found, titleCaseName(name));
    }
  }

  // Standalone Capitalized tokens that look like given names
  const tokens = raw.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
  for (const token of tokens) {
    if (STOP_WORDS.has(token.toLowerCase())) continue;
    if (/^(Create|Show|Find|Make|Build|Search|Please|Happy|Merry)$/i.test(token)) {
      continue;
    }
    if (found.some((p) => p.toLowerCase() === token.toLowerCase())) continue;
    if (
      /^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i.test(
        token,
      )
    ) {
      continue;
    }
    if (isFalsePersonCandidate(token, raw)) continue;
    pushUnique(found, token);
  }

  return found;
}

/** Activity verbs whose objects are props/scenes, not people. */
const ACTIVITY_OBJECT_PATTERN =
  /\b(?:smoking|holding|wearing|eating|drinking|riding|playing|reading|carrying|blowing|lighting)\s+(?:a|an|the|his|her|their)?\s*([a-z][a-z'-]*)/gi;

const GENERIC_ROLE_WORDS = new Set([
  "person",
  "people",
  "someone",
  "somebody",
  "anyone",
  "anybody",
  "friend",
  "friends",
  "guest",
  "guests",
]);

/**
 * Demographic categories used for visual search (“show me men / women / boys”).
 * Never resolve these against the People list.
 */
const PEOPLE_CATEGORY_SEARCH_TERMS = new Set([
  "man",
  "men",
  "male",
  "gentleman",
  "gentlemen",
  "guy",
  "guys",
  "woman",
  "women",
  "female",
  "lady",
  "ladies",
  "boy",
  "boys",
  "girl",
  "girls",
  "child",
  "children",
  "kid",
  "kids",
]);

/**
 * Objects / scene nouns that must never be treated as People-list names.
 * Keep focused on common false positives from activity prompts.
 */
const NON_PERSON_NOUNS = new Set([
  "cigar",
  "cigars",
  "cigarette",
  "cigarettes",
  "pipe",
  "beer",
  "wine",
  "coffee",
  "cake",
  "boat",
  "car",
  "cars",
  "bike",
  "bicycle",
  "guitar",
  "piano",
  "beach",
  "wedding",
  "party",
  "fishing",
  "golf",
  "smoking",
  "tobacco",
  "suit",
  "suits",
  "tuxedo",
  "tie",
  "ties",
  "necktie",
  "dress",
  "dresses",
  "formalwear",
  "indoor",
  "indoors",
  "outdoor",
  "outdoors",
  "inside",
  "outside",
  "interior",
  "exterior",
  "office",
  "home",
  "inflatable",
  "inflatables",
  "bounce",
  "bouncy",
  "obstacle",
  "course",
  "playground",
  "pool",
  "sunset",
  "christmas",
  "tree",
  "dog",
  "dogs",
  "puppy",
  "photo",
  "photos",
  "picture",
  "pictures",
  "image",
  "images",
  "video",
  "videos",
  ...PEOPLE_CATEGORY_SEARCH_TERMS,
]);

/** Phrases that strongly indicate object/scene search. */
const VISUAL_QUERY_PATTERNS = [
  /\b(?:images?|photos?|pictures?|pics?)\s+taken\s+(.+?)(?:\s+from\s+|\s+in\s+\d{4}|$)/i,
  /\b(?:images?|photos?|pictures?|pics?)\s+(?:with|of|showing|containing)\s+(.+?)(?:\s+from\s+|\s+in\s+\d{4}|$)/i,
  /\b(?:slideshow|movie|memory|album)\s+(?:of|with|from)\s+(.+?)(?:\s+photos?\b|\s+pictures?\b|\s+from\s+|$)/i,
  /\b(?:show|find|get)\s+me\s+(?:some\s+|any\s+)?(.+?)$/i,
  /\b(.+?)\s+(?:photos?|pictures?|pics?|images?)\b/i,
];

/** Known visual phrases we can pull even from short prompts ("bounce house"). */
const KNOWN_VISUAL_PHRASES = [
  "inflatable obstacle course",
  "inflatable obstacle courses",
  "obstacle course",
  "bounce house",
  "bouncy castle",
  "bouncy house",
  "birthday cake",
  "christmas tree",
  "beach sunset",
  "wedding cake",
  "swimming pool",
  "bow tie",
  "necktie",
  "formalwear",
  "gentlemen",
  "gentleman",
  "indoors",
  "outdoors",
  "indoor",
  "outdoor",
  "interior",
  "exterior",
  "inflatable",
  "playground",
  "barbecue",
  "graduation",
  "bicycle",
  "sunset",
  "beach",
  "cigar",
  "cigars",
  "smoking",
  "tobacco",
  "suit",
  "suits",
  "tuxedo",
  "tie",
  "ties",
  "dress",
  "office",
  "party",
  "cake",
  "dog",
  "dogs",
  "puppy",
  "pool",
  "bbq",
  "bike",
  "car",
  "cars",
  "men",
  "man",
  "women",
  "woman",
  "girls",
  "girl",
  "boys",
  "boy",
  "kids",
  "children",
];

export function extractVisualQuery(prompt: string): string | undefined {
  const trimmed = prompt.trim();
  if (!trimmed) return undefined;

  for (const pattern of VISUAL_QUERY_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      let phrase = match[1].trim().replace(/[?.!]+$/, "");
      // Drop leading create/show verbs left in capture groups
      phrase = phrase
        .replace(
          /^(?:show me|find|create|make|build|gather)\s+/i,
          "",
        )
        .replace(
          /^(?:a|an|the|some|any)\s+/i,
          "",
        )
        .replace(/^(?:photos?|pictures?|pics?|images?)\s+(?:of|with)\s+/i, "")
        .trim();
      // Strip trailing people/date glue when captured greedily
      phrase = phrase
        .replace(/\s+from\s+.+$/i, "")
        .replace(/\s+of\s+[A-Z][a-z]+.*$/u, "")
        .trim();

      // Person-name-only phrases belong on the People path, not visual tags.
      if (looksLikePersonNameOnly(phrase)) {
        continue;
      }

      // Ignore phrases that are just a person name + media word ("Noah images")
      if (
        /^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:images?|photos?|pictures?|pics?)$/u.test(
          phrase,
        ) ||
        /^(?:images?|photos?|pictures?|pics?)\s+of\s+[A-Z]/u.test(phrase)
      ) {
        continue;
      }
      if (
        phrase.length >= 3 &&
        !/^(me|us|them|photos?|pictures?|images?|pics?)$/i.test(phrase)
      ) {
        return phrase;
      }
    }
  }

  const lower = trimmed.toLowerCase();
  const known = [...KNOWN_VISUAL_PHRASES]
    .sort((a, b) => b.length - a.length)
    .find((phrase) => new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i").test(lower));
  return known;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when a phrase is only a likely personal name (not an object/scene). */
function looksLikePersonNameOnly(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (NON_PERSON_NOUNS.has(lower) || PEOPLE_CATEGORY_SEARCH_TERMS.has(lower)) {
    return false;
  }
  if (KNOWN_VISUAL_PHRASES.some((p) => p === lower)) return false;
  // "Scott", "Mary Jane" — not "beach photos"
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(trimmed);
}

/**
 * True when the candidate is a generic role, scene object, or activity prop —
 * not a real person name we should resolve against the People list.
 */
export function isFalsePersonCandidate(
  candidate: string,
  prompt: string,
): boolean {
  const lower = candidate.trim().toLowerCase();
  if (!lower) return true;
  if (GENERIC_ROLE_WORDS.has(lower)) return true;
  if (PEOPLE_CATEGORY_SEARCH_TERMS.has(lower)) return true;
  if (NON_PERSON_NOUNS.has(lower)) return true;
  if (STOP_WORDS.has(lower)) return true;

  const objects = extractActivityObjects(prompt);
  if (objects.some((o) => sameStem(lower, o))) return true;

  return false;
}

/** Pull nouns that appear as objects of activity verbs (e.g. smoking a cigar). */
export function extractActivityObjects(prompt: string): string[] {
  const found: string[] = [];
  for (const match of prompt.matchAll(ACTIVITY_OBJECT_PATTERN)) {
    const obj = match[1]?.toLowerCase();
    if (obj && obj.length > 1 && !GENERIC_ROLE_WORDS.has(obj)) {
      pushUnique(found, singularize(obj));
    }
  }
  return found;
}

/**
 * Drop false "people" (Cigars, Person, …) into qualities; keep real names.
 * People-category words (men, women, boys) become visual search qualities.
 */
export function scrubFalsePeople(
  prompt: string,
  candidates: string[],
): { people: string[]; qualities: string[] } {
  const people: string[] = [];
  const qualities = extractActivityObjects(prompt);

  // Also harvest explicit category / object asks from the prompt itself.
  const lower = prompt.toLowerCase();
  for (const term of PEOPLE_CATEGORY_SEARCH_TERMS) {
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(lower)) {
      pushUnique(qualities, singularize(term));
    }
  }

  for (const candidate of candidates) {
    if (isFalsePersonCandidate(candidate, prompt)) {
      const stem = singularize(candidate.trim().toLowerCase());
      if (
        stem &&
        !STOP_WORDS.has(stem) &&
        stem.length > 2 &&
        (!GENERIC_ROLE_WORDS.has(stem) ||
          PEOPLE_CATEGORY_SEARCH_TERMS.has(stem) ||
          PEOPLE_CATEGORY_SEARCH_TERMS.has(candidate.trim().toLowerCase()))
      ) {
        pushUnique(qualities, stem);
      }
      continue;
    }
    pushUnique(people, candidate);
  }

  return { people, qualities };
}

/** Scene/activity ask with no named person. */
export function looksLikeSceneSearch(prompt: string, people: string[]): boolean {
  if (people.length > 0) return false;
  const lower = prompt.toLowerCase();
  if (extractVisualQuery(prompt)) return true;
  if (extractActivityObjects(prompt).length > 0) return true;
  if (
    /\b(a person|someone|somebody|anyone|anybody|a man|a woman|a guy)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  if (
    /\b(inflatable|bounce house|bouncy|obstacle course|birthday cake|christmas tree|beach|playground|sunset|cigar|suit|tie|indoor|outdoor|indoors|outdoors|gentlemen|men|women|girls|boys)\b/.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

function singularize(value: string): string {
  if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) {
    return value.slice(0, -1);
  }
  return value;
}

function sameStem(a: string, b: string): boolean {
  return singularize(a) === singularize(b);
}

/** First names that collide with seasons/months in casual prompts. */
const SEASONISH_FIRST_NAMES = new Set([
  "summer",
  "winter",
  "spring",
  "fall",
  "autumn",
  "may",
  "march",
  "april",
  "june",
  "july",
  "august",
  "january",
  "february",
  "september",
  "october",
  "november",
  "december",
]);

/**
 * Find account people mentioned in the prompt (case-insensitive full or first name).
 * Prefer this over guessing — only returns names that exist in knownPeople.
 */
export function findKnownPeopleMentions(
  prompt: string,
  knownPeople: string[],
): string[] {
  const found: string[] = [];
  // Longer names first so "Noah Roberts" wins over "Noah" alone when both match.
  const sorted = [...knownPeople]
    .map((n) => n.trim())
    .filter((n) => n.length >= 2)
    .sort((a, b) => b.length - a.length);

  for (const name of sorted) {
    const full = name.toLowerCase();
    const first = full.split(/\s+/)[0] ?? "";

    const fullPattern = new RegExp(`\\b${escapeRegExp(full)}\\b`, "i");
    if (fullPattern.test(prompt)) {
      pushUnique(found, name);
      continue;
    }

    // First-name-only: skip tiny tokens and season/month collisions ("last summer").
    if (first.length >= 3 && !SEASONISH_FIRST_NAMES.has(first)) {
      const firstPattern = new RegExp(`\\b${escapeRegExp(first)}\\b`, "i");
      if (firstPattern.test(prompt)) {
        pushUnique(found, name);
      }
    }
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

function extractDateRange(raw: string, now: Date): AssistantDateRange | undefined {
  const lower = raw.toLowerCase();

  const grade = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+grade\b/i);
  if (grade) {
    return { label: `${ordinal(Number(grade[1]))} grade` };
  }

  const christmas = raw.match(/\bchristmas\s+(20\d{2}|19\d{2})\b/i);
  if (christmas) {
    const year = christmas[1]!;
    return {
      label: `Christmas ${year}`,
      start: `${year}-12-01`,
      end: `${year}-12-31`,
    };
  }

  if (/\bchristmas\b/i.test(raw) && !/\bchristmas\s+\d{4}\b/i.test(raw)) {
    return { label: "Christmas" };
  }

  const yearOnly = raw.match(/\b((?:19|20)\d{2})\b/);
  if (yearOnly) {
    const year = yearOnly[1]!;
    return { label: year, start: `${year}-01-01`, end: `${year}-12-31` };
  }

  if (/\blast\s+summer\b/.test(lower)) {
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      label: "last summer",
      start: `${year}-06-01`,
      end: `${year}-08-31`,
    };
  }

  if (/\blast\s+year\b/.test(lower)) {
    const year = now.getFullYear() - 1;
    return {
      label: "last year",
      start: `${year}-01-01`,
      end: `${year}-12-31`,
    };
  }

  if (/\bthis\s+summer\b/.test(lower)) {
    const year = now.getFullYear();
    return {
      label: "this summer",
      start: `${year}-06-01`,
      end: `${year}-08-31`,
    };
  }

  return undefined;
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n % 100 !== 11
      ? "st"
      : n % 10 === 2 && n % 100 !== 12
        ? "nd"
        : n % 10 === 3 && n % 100 !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* Qualities                                                                   */
/* -------------------------------------------------------------------------- */

const QUALITY_LEXICON = [
  "humor",
  "humour",
  "depth",
  "kindness",
  "warmth",
  "courage",
  "wisdom",
  "joy",
  "love",
  "strength",
  "gentleness",
  "faith",
  "fishing",
  "smoking",
  "cigar",
  "cigarette",
  "suit",
  "tie",
  "necktie",
  "dress",
  "beach",
  "indoors",
  "outdoors",
  "indoor",
  "outdoor",
  "boat",
  "wedding",
  "cake",
  "sports",
  "music",
  "cooking",
  "gardening",
  "travel",
  "adventure",
] as const;

function extractQualities(raw: string, lower: string): string[] | undefined {
  const found: string[] = [];

  // "highlighting his humor and depth"
  const highlight = raw.match(
    /\b(?:highlighting|highlight|featuring|celebrating|showing|about)\s+(?:his|her|their|the)?\s*(.+)$/i,
  );
  if (highlight?.[1]) {
    const chunk = highlight[1]
      .replace(/\b(and|&|,)\b/gi, ",")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    for (const part of chunk) {
      const word = part.replace(/[^a-z\s-]/gi, "").trim();
      if (word && word.length < 40 && !STOP_WORDS.has(word)) {
        // take first word if phrase
        const primary = word.split(/\s+/)[0]!;
        if (primary.length > 2) pushUnique(found, normalizeQuality(primary));
      }
    }
  }

  for (const q of QUALITY_LEXICON) {
    if (new RegExp(`\\b${q}\\b`, "i").test(lower)) {
      pushUnique(found, normalizeQuality(q));
    }
  }

  return found.length ? found : undefined;
}

function normalizeQuality(value: string): string {
  if (value === "humour") return "humor";
  return value;
}

/* -------------------------------------------------------------------------- */
/* Clarify / confidence / titles                                               */
/* -------------------------------------------------------------------------- */

function buildClarifyingQuestions(input: {
  action: AssistantActionType;
  people: string[];
  date_range?: AssistantDateRange;
  lower: string;
}): string[] {
  const questions: string[] = [];

  if (input.action === "clarify") {
    questions.push(
      "Would you like to search your photos, create a memory album, or generate a slideshow/movie?",
    );
  }

  if (
    (input.action === "create_movie" || input.action === "create_memory") &&
    input.people.length === 0 &&
    !input.date_range
  ) {
    questions.push(
      "Who should this focus on, and is there a time period (for example a year or grade)?",
    );
  }

  // Vague one-word-ish requests
  if (input.lower.length < 12) {
    questions.push("Can you share a bit more detail about what you want?");
  }

  return questions;
}

function estimateConfidence(input: {
  action: AssistantActionType;
  people: string[];
  date_range?: AssistantDateRange;
  tone?: AssistantTone;
  qualities?: string[];
}): number {
  let score = 0.55;
  if (input.action !== "clarify") score += 0.15;
  if (input.people.length > 0) score += 0.12;
  if (input.date_range) score += 0.08;
  if (input.tone) score += 0.05;
  if (input.qualities && input.qualities.length > 0) score += 0.05;
  return Math.min(0.95, score);
}

function suggestTitle(input: {
  action: AssistantActionType;
  people: string[];
  date_range?: AssistantDateRange;
  tone?: AssistantTone;
}): string | undefined {
  if (input.action === "search_media" || input.action === "clarify" || input.action === "answer_help") {
    return undefined;
  }
  const who = input.people[0];
  if (input.tone === "memorial" && who) {
    return `In Memory of ${who}`;
  }
  if (who && input.date_range?.label) {
    return `${who} — ${capitalizeLabel(input.date_range.label)}`;
  }
  if (who) return who;
  if (input.date_range?.label) return capitalizeLabel(input.date_range.label);
  return undefined;
}

function capitalizeLabel(label: string): string {
  return label.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Finalize: known-people matching + cleanup                                   */
/* -------------------------------------------------------------------------- */

function finalizeIntent(
  intent: AssistantIntent,
  options: ParseIntentOptions,
  meta: ParseIntentMeta,
): ParseIntentResult {
  // Catch lowercase mentions the LLM/heuristics missed ("photos of noah").
  const fromPrompt =
    options.knownPeople && options.knownPeople.length > 0
      ? findKnownPeopleMentions(intent.raw_prompt, options.knownPeople)
      : [];

  // Drop objects/activities the model mistook for names ("Cigars", "Person").
  const scrubbed = scrubFalsePeople(intent.raw_prompt, [
    ...intent.people,
    ...fromPrompt,
  ]);
  const matched = matchKnownPeople(scrubbed.people, options.knownPeople);
  const mergedQualities = uniqueStrings([
    ...(intent.qualities ?? []),
    ...scrubbed.qualities,
    ...(intent.objects ?? []),
    ...(intent.scenes ?? []),
  ]);
  const visual_query =
    intent.visual_query?.trim() ||
    extractVisualQuery(intent.raw_prompt) ||
    (mergedQualities.length ? mergedQualities.join(" ") : undefined);
  const objects = uniqueStrings([
    ...(intent.objects ?? []),
    ...scrubbed.qualities,
  ]);
  const sceneHints = uniqueStrings([
    ...(intent.scenes ?? []),
    ...(visual_query &&
    /\b(indoor|indoors|outdoor|outdoors|inside|outside|interior|exterior|beach|office|home|party|wedding|playground)\b/i.test(
      visual_query,
    )
      ? visual_query
          .split(/\s+/)
          .map((w) => w.replace(/[^a-z0-9-]/gi, ""))
          .filter((w) =>
            /^(indoor|indoors|outdoor|outdoors|inside|outside|interior|exterior|beach|office|home|party|wedding|playground)$/i.test(
              w,
            ),
          )
      : []),
  ]);
  const scenes = sceneHints;

  let action = intent.action;
  let clarifying_questions = intent.clarifying_questions
    ? [...intent.clarifying_questions]
    : undefined;
  let confidence = intent.confidence;

  // Mentions that could not be matched to account people → ask to clarify.
  // We still return the raw candidate names so the UI can show what was heard;
  // executors must resolve against the account and never invent identities.
  if (
    options.knownPeople &&
    options.knownPeople.length > 0 &&
    matched.unresolved.length > 0 &&
    action !== "clarify"
  ) {
    action = "clarify";
    clarifying_questions = [
      ...(clarifying_questions ?? []),
      `I couldn't match ${matched.unresolved.map((n) => `"${n}"`).join(", ")} to people in your account. Which person did you mean?`,
    ];
    confidence = Math.min(confidence ?? 0.5, 0.4);
  }

  const people =
    matched.resolved.length > 0 ? matched.resolved : matched.candidates;

  // Scene / object asks → search (do not invent people / do not dead-end).
  // Keep clarify when a named person could not be matched to the account.
  const isVisualAsk =
    Boolean(visual_query) ||
    objects.length > 0 ||
    scenes.length > 0 ||
    (looksLikeSceneSearch(intent.raw_prompt, people) &&
      mergedQualities.length > 0);

  const hasUnresolvedPeople =
    Boolean(options.knownPeople?.length) && matched.unresolved.length > 0;

  if (
    isVisualAsk &&
    !hasUnresolvedPeople &&
    (action === "search_media" || action === "clarify")
  ) {
    action = "search_media";
    // Drop outdated "who is in the photo" clarifying copy for pure visual asks.
    clarifying_questions = (clarifying_questions ?? []).filter(
      (q) =>
        !/what.?s happening in the picture/i.test(q) &&
        !/who should i look for/i.test(q) &&
        !/who is in the photo/i.test(q),
    );
    if (clarifying_questions.length === 0) clarifying_questions = undefined;
    confidence = Math.max(confidence ?? 0.7, 0.75);
  }

  // Product how-to / plan limits → answer_help (never fall through to empty photo search).
  if (
    shouldOverrideWithProductHelp({
      action,
      raw_prompt: intent.raw_prompt,
    })
  ) {
    action = "answer_help";
    clarifying_questions = undefined;
    confidence = Math.max(confidence ?? 0.85, 0.9);
  }

  // Mixed find + how-to: keep search (do not create from the how-to clause).
  if (
    action !== "answer_help" &&
    isMixedHelpAndMediaRequest(intent.raw_prompt) &&
    SEARCH_CUES.test(intent.raw_prompt.toLowerCase())
  ) {
    action = "search_media";
    clarifying_questions = undefined;
    confidence = Math.max(confidence ?? 0.8, 0.84);
  }

  // Low LLM confidence → clarify (skip for clear visual searches and product help)
  if (
    action !== "clarify" &&
    action !== "answer_help" &&
    !isVisualAsk &&
    (confidence ?? 1) < 0.55
  ) {
    action = "clarify";
    clarifying_questions = clarifying_questions?.length
      ? clarifying_questions
      : [
          "I want to make sure I get this right — can you confirm who this is for and whether you want a slideshow, a memory album, or just to browse photos?",
        ];
  }

  const result: ParseIntentResult = {
    action,
    people,
    raw_prompt: intent.raw_prompt,
    confidence,
  };

  if (intent.date_range) result.date_range = intent.date_range;
  if (intent.tone) result.tone = intent.tone;
  if (mergedQualities.length) result.qualities = mergedQualities;
  if (visual_query) result.visual_query = visual_query;
  if (objects.length) result.objects = objects;
  if (scenes.length) result.scenes = scenes;
  // Heuristic is authoritative so "videos of X" / "photos of X" stay consistent.
  result.media_preference = detectMediaPreference(intent.raw_prompt);
  if (intent.theme_preference) result.theme_preference = intent.theme_preference;
  if (intent.title_suggestion) result.title_suggestion = intent.title_suggestion;
  if (intent.document_title) result.document_title = intent.document_title;
  if (intent.document_category) result.document_category = intent.document_category;
  if (intent.document_category_description) {
    result.document_category_description = intent.document_category_description;
  }
  if (intent.legacy_contact_name) result.legacy_contact_name = intent.legacy_contact_name;
  if (intent.legacy_contact_category) {
    result.legacy_contact_category = intent.legacy_contact_category;
  }
  if (intent.legacy_contact_email) result.legacy_contact_email = intent.legacy_contact_email;
  if (intent.legacy_contact_phone) result.legacy_contact_phone = intent.legacy_contact_phone;
  if (intent.legacy_contact_relationship) {
    result.legacy_contact_relationship = intent.legacy_contact_relationship;
  }
  if (intent.legacy_instruction_section) {
    result.legacy_instruction_section = intent.legacy_instruction_section;
  }
  if (intent.legacy_instruction_title) {
    result.legacy_instruction_title = intent.legacy_instruction_title;
  }
  if (intent.legacy_instruction_content) {
    result.legacy_instruction_content = intent.legacy_instruction_content;
  }
  if (clarifying_questions?.length) {
    result.clarifying_questions = clarifying_questions;
  }

  result._meta = meta;
  return result;
}

function matchKnownPeople(
  candidates: string[],
  knownPeople?: string[],
): {
  candidates: string[];
  resolved: string[];
  unresolved: string[];
} {
  const cleaned = candidates.map(cleanName).filter(Boolean);
  if (!knownPeople || knownPeople.length === 0) {
    return { candidates: cleaned, resolved: [], unresolved: [] };
  }

  const resolved: string[] = [];
  const unresolved: string[] = [];

  for (const candidate of cleaned) {
    const match = knownPeople.find((known) => namesLooselyMatch(candidate, known));
    if (match) {
      pushUnique(resolved, match);
    } else {
      pushUnique(unresolved, candidate);
    }
  }

  return { candidates: cleaned, resolved, unresolved };
}

function namesLooselyMatch(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === right) return true;
  if (right.includes(left) || left.includes(right)) return true;
  const leftFirst = left.split(/\s+/)[0]!;
  const rightFirst = right.split(/\s+/)[0]!;
  return leftFirst.length > 2 && leftFirst === rightFirst;
}

/* -------------------------------------------------------------------------- */
/* Small utils                                                                 */
/* -------------------------------------------------------------------------- */

function normalizeDateRange(
  value: AssistantDateRange | undefined,
): AssistantDateRange | undefined {
  if (!value) return undefined;
  const next: AssistantDateRange = {};
  if (value.start?.trim()) next.start = value.start.trim();
  if (value.end?.trim()) next.end = value.end.trim();
  if (value.label?.trim()) next.label = value.label.trim();
  return Object.keys(next).length ? next : undefined;
}

function cleanStringList(
  values: string[] | null | undefined,
): string[] | undefined {
  if (!values?.length) return undefined;
  const out: string[] = [];
  for (const value of values) {
    const cleaned = value.trim();
    if (cleaned) pushUnique(out, cleaned);
  }
  return out.length ? out : undefined;
}

function cleanName(value: string): string {
  return value.replace(/[^\p{L}\p{M}\s'-]/gu, "").trim();
}

function pushUnique(list: string[], value: string): void {
  if (!list.some((item) => item.toLowerCase() === value.toLowerCase())) {
    list.push(value);
  }
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) pushUnique(out, trimmed);
  }
  return out;
}
