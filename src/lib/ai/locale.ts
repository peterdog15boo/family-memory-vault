/**
 * Locale helpers for Ask AI (intent + replies + help).
 */

import { getAccountPreferences } from "@/lib/account-preferences";
import {
  APP_LOCALE_LABELS,
  DEFAULT_LOCALE,
  createTranslator,
  isAppLocale,
  type AppLocale,
  type TranslateFn,
} from "@/lib/i18n";

export type AssistantLocaleContext = {
  locale: AppLocale;
  t: TranslateFn;
  /** Native or English language name for LLM instructions. */
  languageName: string;
};

/** Human-readable language names for system prompts. */
export function assistantLanguageName(locale: AppLocale): string {
  switch (locale) {
    case "en-US":
      return "English";
    case "es":
      return "Spanish";
    case "fr":
      return "French";
    case "de":
      return "German";
    case "pt-BR":
      return "Brazilian Portuguese";
    case "zh-CN":
      return "Simplified Chinese";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "it":
      return "Italian";
    case "nl":
      return "Dutch";
    default:
      return APP_LOCALE_LABELS[locale] ?? "English";
  }
}

export async function resolveAssistantLocale(
  userId: string,
): Promise<AssistantLocaleContext> {
  let locale: AppLocale = DEFAULT_LOCALE;
  try {
    const prefs = await getAccountPreferences(userId);
    if (isAppLocale(prefs.locale)) locale = prefs.locale;
  } catch {
    // fall through
  }
  return {
    locale,
    t: createTranslator(locale),
    languageName: assistantLanguageName(locale),
  };
}

/**
 * Extra intent-parser rules so multilingual prompts map to English vision terms
 * while clarifications / titles match the UI locale.
 */
export function intentLocalePromptSuffix(locale: AppLocale): string {
  const language = assistantLanguageName(locale);
  const replyRule =
    locale === "en-US"
      ? "- clarifying_questions and title_suggestion: write in clear, warm English."
      : `- clarifying_questions and title_suggestion: write in ${language} (warm, simple, natural — not stiff machine translation).`;

  return `

Language rules:
- Understand the user in any language (including ${language}).
- Always normalize visual_query, objects, scenes, and qualities into concise ENGLISH terms that match photo labels (e.g. Spanish "fotos de la playa" → visual_query "beach photos", scenes:["beach"]; French "photos de plage" → same).
- Do not put language-specific words like foto/fotos/bilder/写真 into visual_query unless they are the subject.
- people: keep the names/kinship labels the user said (do not translate proper names).
${replyRule}`;
}
