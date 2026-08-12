/**
 * Localize free-form Ask AI prose (help KB bodies) into the UI locale.
 */

import { completeChatJson, isLlmConfigured } from "@/lib/ai/llm";
import { assistantLanguageName } from "@/lib/ai/locale";
import type { AppLocale } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { z } from "zod";

const localizedSchema = z.object({
  text: z.string().min(1),
});

/**
 * When locale is not English and an LLM is available, adapt prose to that language.
 * Keeps product names (Family Memory Vault, Ask AI, Memory) and route paths unchanged.
 * Falls back to the original English text on any failure.
 */
export async function localizeAssistantProse(
  text: string,
  locale: AppLocale,
  signal?: AbortSignal,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || locale === DEFAULT_LOCALE || !isLlmConfigured()) {
    return text;
  }

  const language = assistantLanguageName(locale);
  try {
    const result = await completeChatJson({
      messages: [
        {
          role: "system",
          content: `You adapt Family Memory Vault Ask AI replies into ${language}.
Return JSON: {"text":"..."}.
Rules:
- Warm, simple, natural ${language} — not stiff or overly formal.
- Keep product names: Family Memory Vault, Ask AI, Memory, Memories, Digital Legacy.
- Keep in-app paths like /family, /media, /settings unchanged.
- Keep people names and quoted titles unchanged.
- Preserve list structure and line breaks.
- Do not add new facts.`,
        },
        {
          role: "user",
          content: `Locale: ${locale}\n\nText to adapt:\n${trimmed}`,
        },
      ],
      temperature: 0.2,
      signal,
    });
    const parsed = localizedSchema.parse(JSON.parse(result.content));
    return parsed.text.trim() || text;
  } catch {
    return text;
  }
}
