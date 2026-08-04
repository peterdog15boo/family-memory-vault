/**
 * Retrieve and format product help answers for Ask AI.
 */

import {
  HELP_KNOWLEDGE,
  type HelpKnowledgeEntry,
  type HelpTopicId,
} from "@/lib/ai/help/knowledge";
import { canCreateMovie } from "@/lib/plans/gates";
import { getUserPlan } from "@/lib/plans";
import { formatBytes, getStorageQuotaForUser } from "@/lib/billing/quotas";

export type HelpAnswerLink = { label: string; href: string };

export type HelpAnswer = {
  topicIds: HelpTopicId[];
  message: string;
  links: HelpAnswerLink[];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreEntry(promptLower: string, tokens: string[], entry: HelpKnowledgeEntry): number {
  let score = 0;
  for (const keyword of entry.keywords) {
    const k = keyword.toLowerCase();
    if (k.includes(" ") || k.includes(".*")) {
      try {
        if (new RegExp(k.replace(/\.\*/g, ".*"), "i").test(promptLower)) {
          score += 6;
        }
      } catch {
        if (promptLower.includes(k)) score += 5;
      }
    } else if (promptLower.includes(k)) {
      score += 4;
    } else if (tokens.includes(k)) {
      score += 2;
    }
  }

  // Topic title overlap
  for (const t of tokenize(entry.topic)) {
    if (tokens.includes(t) && t.length > 3) score += 1;
  }

  return score;
}

/** Rank knowledge entries for a user prompt. */
export function retrieveHelpEntries(
  prompt: string,
  limit = 2,
): HelpKnowledgeEntry[] {
  const lower = prompt.toLowerCase();
  const tokens = tokenize(prompt);
  const ranked = HELP_KNOWLEDGE.map((entry) => ({
    entry,
    score: scoreEntry(lower, tokens, entry),
  }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    // Gentle default when we recognize help intent but no strong topic match.
    return HELP_KNOWLEDGE.filter((e) =>
      ["ask_ai_search", "upload_photos", "create_memory"].includes(e.id),
    ).slice(0, 1);
  }

  const top = ranked.slice(0, limit).map((r) => r.entry);
  // Prefer a single best match when it's clearly dominant.
  if (ranked[0] && ranked[1] && ranked[0].score >= ranked[1].score + 6) {
    return [ranked[0].entry];
  }
  return top;
}

function formatBytesSafe(bytes: number | null | undefined): string {
  if (bytes == null) return "Unlimited";
  try {
    return formatBytes(bytes, 0);
  } catch {
    return `${Math.round(bytes / (1024 ** 3))} GB`;
  }
}

async function buildPlanContext(
  userId: string,
  entries: HelpKnowledgeEntry[],
): Promise<string[]> {
  if (!entries.some((e) => e.planAware)) return [];

  const lines: string[] = [];
  try {
    const { plan, limits } = await getUserPlan(userId);
    lines.push(`You’re on the ${plan.name} plan.`);

    const needsMovies = entries.some(
      (e) => e.id === "movie_limits" || e.id === "create_movie" || e.id === "billing_upgrade",
    );
    if (needsMovies) {
      const movies = await canCreateMovie(userId);
      const limit = limits.maxMoviesPerMonth;
      const used = movies.used ?? 0;
      if (limit == null) {
        lines.push("Your plan does not list a fixed monthly movie cap in our catalog.");
      } else {
        lines.push(
          `This month you’ve used ${used} of ${limit} movie${limit === 1 ? "" : "s"}.`,
        );
        if (!movies.allowed) {
          lines.push(
            movies.upgradeHint ||
              "You’ve reached this month’s movie limit. Upgrade on Billing for a higher monthly allowance.",
          );
        } else if (used >= Math.max(0, limit - 1) && limit <= 5) {
          lines.push(
            "Need more movies this month? Upgrade on Billing for a higher monthly allowance.",
          );
        }
      }
    }

    const needsFamily = entries.some((e) => e.id === "invite_family");
    if (needsFamily) {
      if (!limits.features?.familySharing) {
        lines.push(
          `Family sharing isn’t included on ${plan.name}. Upgrade to a Family plan to invite members.`,
        );
      } else {
        lines.push(
          `Your plan allows up to ${limits.maxFamilyMembers} family member${limits.maxFamilyMembers === 1 ? "" : "s"}.`,
        );
      }
    }

    const needsStorage = entries.some(
      (e) => e.id === "storage_limits" || e.id === "billing_upgrade",
    );
    if (needsStorage) {
      const storage = await getStorageQuotaForUser(userId);
      lines.push(
        `Storage: ${formatBytesSafe(storage.usedBytes)} used of ${formatBytesSafe(storage.limitBytes)}.`,
      );
    }
  } catch {
    // Plan lookup failed — still answer with generic help.
  }

  return lines;
}

function formatEntryBody(entry: HelpKnowledgeEntry): string[] {
  const parts: string[] = [`**${entry.topic}**`, entry.summary];
  if (entry.steps && entry.steps.length > 0) {
    parts.push("");
    parts.push(...entry.steps.map((step, i) => `${i + 1}. ${step}`));
  }
  if (entry.notes && entry.notes.length > 0) {
    parts.push("");
    for (const note of entry.notes) {
      parts.push(`Note: ${note}`);
    }
  }
  return parts;
}

/**
 * Build a warm help reply from knowledge + optional live plan context.
 */
export async function answerProductHelp(
  userId: string,
  prompt: string,
): Promise<HelpAnswer> {
  const entries = retrieveHelpEntries(prompt, 2);
  const planLines = await buildPlanContext(userId, entries);

  const sections: string[] = [];
  for (const entry of entries) {
    if (sections.length) sections.push("");
    sections.push(...formatEntryBody(entry));
  }

  if (planLines.length) {
    sections.push("");
    sections.push("Your plan right now:");
    for (const line of planLines) {
      sections.push(`• ${line}`);
    }
  }

  const linkMap = new Map<string, HelpAnswerLink>();
  for (const entry of entries) {
    for (const route of entry.relatedRoutes) {
      linkMap.set(route.href, route);
    }
  }
  // Prefer Billing when plan-aware answers mention upgrading.
  if (planLines.some((l) => /upgrade/i.test(l))) {
    linkMap.set("/billing", { label: "Billing", href: "/billing" });
  }

  if (entries.length === 0) {
    return {
      topicIds: [],
      message: [
        "I can help with how to use Family Memory Vault.",
        "",
        "Try asking things like:",
        "• How do I invite family members?",
        "• Where do I create a Memory?",
        "• Why don’t my photos show up right away?",
        "• How can I make more movies this month?",
        "",
        "Or ask me to find photos — for example, “Show me beach photos.”",
      ].join("\n"),
      links: [
        { label: "Ask AI tips", href: "/assistant" },
        { label: "Photos", href: "/media" },
        { label: "Settings", href: "/settings" },
      ],
    };
  }

  // Soften markdown bold for plain chat — keep readable without requiring MD.
  const message = sections
    .join("\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1");

  return {
    topicIds: entries.map((e) => e.id),
    message,
    links: [...linkMap.values()],
  };
}

/**
 * True when the prompt includes a clear photo find/create ask
 * (used so mixed "find X and how to Y" stays on media search).
 */
export function hasStrongMediaRequest(prompt: string): boolean {
  const raw = prompt.trim();
  const lower = raw.toLowerCase();
  if (
    /\b(show\s+me|find|search|look\s+for)\b.{0,60}\b(photos?|pictures?|images?|videos?|pics?)\b/i.test(
      raw,
    ) ||
    /\b(photos?|pictures?|images?)\s+of\b/i.test(raw)
  ) {
    return true;
  }
  // Imperative create without how/limits language
  if (
    /\b(create|make|build)\b.{0,40}\b(slideshow|movie|montage|memory|album)\b/i.test(
      raw,
    ) &&
    !/\b(how|where|why|limit|quota|more than|upgrade|plan)\b/i.test(lower)
  ) {
    return true;
  }
  return false;
}

/**
 * Mixed request: find photos AND ask a product how-to in the same message.
 */
export function isMixedHelpAndMediaRequest(prompt: string): boolean {
  const raw = prompt.trim();
  if (!hasStrongMediaRequest(raw)) return false;
  return (
    /\b(how (do|can|to|should) i|where (do|can|to|should) i|tell me how|why (don'?t|doesn'?t|can'?t))\b/i.test(
      raw,
    ) || /\band\b.{0,40}\b(how|where|why)\b/i.test(raw)
  );
}

/**
 * Short how-to tip for mixed media+help prompts (appended to search answers).
 */
export function formatSecondaryHelpTip(prompt: string): string | null {
  if (!isMixedHelpAndMediaRequest(prompt)) return null;
  const entries = retrieveHelpEntries(prompt, 2).filter(
    (e) => e.id !== "ask_ai_search",
  );
  const entry = entries[0];
  if (!entry) return null;
  const steps =
    entry.steps && entry.steps.length > 0
      ? `\n${entry.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";
  const route = entry.relatedRoutes[0]
    ? `\nOpen ${entry.relatedRoutes[0].label} (${entry.relatedRoutes[0].href}) when you’re ready.`
    : "";
  return `\n\nAlso — ${entry.summary}${steps}${route}`;
}

/**
 * True when the prompt is a product how-to / limits question,
 * not a photo search or create request.
 */
export function isProductHelpQuestion(prompt: string): boolean {
  const raw = prompt.trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();

  // Bare help
  if (/^help\b/.test(lower) || lower === "?" || /^what can you (do|help)/i.test(raw)) {
    return true;
  }

  // Strong media browse/create should win (including mixed find + how-to)
  if (hasStrongMediaRequest(raw)) return false;

  // How / where / why / what-does product questions
  if (
    /^(how|where|why|what)\b/i.test(raw) ||
    /\b(how (do|can|to|should) i|where (do|can|to|should) i|why (don'?t|doesn'?t|can'?t|won'?t|isn'?t|aren'?t)|what does .+ mean|what is .+ for)\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  // Limit / upgrade / feature orientation without requiring how-
  if (
    /\b(more than \d+\s+movies|movies?\s+per\s+month|movie\s+(limit|quota|cap)|invite\s+(family|members|someone)|digital\s+legacy|change\s+(my\s+)?avatar|upgrade\s+(my\s+)?plan|storage\s+(full|limit|quota)|family\s+members?\s+limit)\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  return false;
}

const HELP_OVERRIDE_SKIP_ACTIONS = new Set([
  "create_document_category",
  "file_private_document",
  "add_legacy_contact",
  "draft_legacy_business",
]);

/**
 * Prefer answer_help when the user asked a product how-to / limits question.
 * Keeps private-vault mutations and checklist reviews when clearly intended.
 */
export function shouldOverrideWithProductHelp(intent: {
  action: string;
  raw_prompt: string;
}): boolean {
  if (!isProductHelpQuestion(intent.raw_prompt)) return false;
  if (HELP_OVERRIDE_SKIP_ACTIONS.has(intent.action)) return false;
  if (intent.action === "review_legacy_checklist") {
    return !/\b(checklist|still need|what.?s missing|what documents)\b/i.test(
      intent.raw_prompt,
    );
  }
  return true;
}
