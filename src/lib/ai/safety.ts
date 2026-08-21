/**
 * Assistant safety constraints — ownership, clean media, and user-facing errors.
 *
 * Invariants:
 * - Media for Ask AI search uses clean/ready media the user can view
 *   (owned + family-shared), via the same person-media rule as People pages.
 * - Creates attach only media the user can access; people/faces stay
 *   scoped to the current user's People graph.
 * - People IDs must belong to the current user; never trust client/proposal IDs alone.
 * - User-facing errors stay generic; details go to structured logs only.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people } from "@/lib/db/schema";
import type { AssistantIntent } from "@/lib/assistant/types";
import type { ResolvedIntent } from "@/lib/ai/resolve";

/** Max clean media attached to an assistant-created memory/movie. */
export const ASSISTANT_CREATE_MEDIA_LIMIT = 48;

/**
 * Soft threshold for search: still return results, but suggest refining.
 */
export const ASSISTANT_SEARCH_SPARSE_THRESHOLD = 3;

/**
 * Re-validate person IDs against the current user's people table.
 * Drops any IDs that are missing or belong to another user.
 */
export async function filterOwnedPeopleIds(
  userId: string,
  peopleIds: string[],
): Promise<string[]> {
  const unique = [...new Set(peopleIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const db = getDb();
  const rows = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.userId, userId), inArray(people.id, unique)));

  const allowed = new Set(rows.map((row) => row.id));
  return unique.filter((id) => allowed.has(id));
}

/**
 * Rebuild a ResolvedIntent with only people the user still owns.
 */
export async function revalidateResolvedPeople(
  userId: string,
  resolved: ResolvedIntent,
): Promise<ResolvedIntent> {
  const ownedIds = await filterOwnedPeopleIds(userId, resolved.peopleIds);
  const ownedSet = new Set(ownedIds);

  const matchedPeople = resolved.matchedPeople.filter((p) => ownedSet.has(p.id));
  const dropped = resolved.peopleIds.filter((id) => !ownedSet.has(id));

  const clarifyingQuestions = [...resolved.clarifyingQuestions];
  if (dropped.length > 0) {
    clarifyingQuestions.push(
      "One or more people from that draft are no longer available in your account. Who should this focus on?",
    );
  }

  return {
    ...resolved,
    peopleIds: ownedIds,
    matchedPeople,
    needsClarification:
      resolved.needsClarification ||
      (dropped.length > 0 && matchedPeople.length === 0),
    clarifyingQuestions,
  };
}

/**
 * Creates without people, a time window, or a visual focus are too broad — ask first.
 */
export function shouldClarifyBeforeCreate(
  intent: AssistantIntent,
  resolved: ResolvedIntent,
): boolean {
  if (intent.action !== "create_memory" && intent.action !== "create_movie") {
    return false;
  }
  const hasPeople = resolved.peopleIds.length > 0;
  const hasConcreteDate = Boolean(resolved.dateFilter?.isConcrete);
  const hasDateLabel = Boolean(resolved.dateFilter?.label);
  const hasVisualFocus =
    Boolean(intent.visual_query?.trim()) ||
    (intent.objects?.length ?? 0) > 0 ||
    (intent.scenes?.length ?? 0) > 0 ||
    (intent.qualities?.length ?? 0) > 0;
  return !hasPeople && !hasConcreteDate && !hasDateLabel && !hasVisualFocus;
}

/**
 * Searches with no person, time, or scene terms dump the whole clean library —
 * ask who/when first unless the user clearly asked for everything.
 */
export function shouldClarifyBeforeSearch(
  intent: AssistantIntent,
  resolved: ResolvedIntent,
): boolean {
  if (intent.action !== "search_media") return false;
  const hasPeople = resolved.peopleIds.length > 0;
  const hasConcreteDate = Boolean(resolved.dateFilter?.isConcrete);
  const hasDateLabel = Boolean(resolved.dateFilter?.label);
  const hasSceneTerms =
    (intent.qualities?.length ?? 0) > 0 ||
    Boolean(intent.visual_query?.trim()) ||
    (intent.objects?.length ?? 0) > 0 ||
    (intent.scenes?.length ?? 0) > 0;
  if (hasPeople || hasConcreteDate || hasDateLabel || hasSceneTerms) {
    return false;
  }

  const lower = (intent.raw_prompt ?? "").toLowerCase();
  if (/\b(all|everything|entire library|every photo|every image)\b/.test(lower)) {
    return false;
  }
  return true;
}

/** Generic copy safe to show in the UI (no DB / stack details). */
export function publicAssistantErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Something went wrong. Please try again in a moment.";
  }
  const message = error.message.toLowerCase();
  if (message.includes("not found")) {
    return "I couldn’t find that conversation or item.";
  }
  if (message.includes("plan") || message.includes("quota") || message.includes("limit")) {
    return error.message; // plan gates already write safe copy
  }
  if (message.includes("clean") || message.includes("ready")) {
    return "I can only use photos that have finished safety review.";
  }
  return "I couldn’t finish that safely. Please try again, or rephrase your request.";
}

/**
 * Safety notes for logs / docs — not user-facing.
 */
export const ASSISTANT_SAFETY_SUMMARY = [
  "Only moderation_status=clean and status=ready media is queried or attached.",
  "People, faces, memories, and movies are scoped to the signed-in user.",
  "Assistant creates never invent people or pull another user’s library.",
  "Family co-member gallery media is not used for assistant creates (owner media only).",
  "Private document and Digital Legacy assistance is limited to the signed-in owner's own data.",
  "Assistant may help with document categories, document filing, contacts, instructions, and checklist gaps, but not secure-item secrets.",
  "legacy_secure_items, emergency_access_designations, sensitive_access_events, and connected financial accounts stay out of assistant scope.",
] as const;

/** Database tables the assistant must never read or search. */
export const ASSISTANT_EXCLUDED_DATA_DOMAINS = [
  "legacy_secure_items",
  "legacy_videos",
  "emergency_access_designations",
  "sensitive_access_events",
  "plaid_items",
  "linked_accounts",
  "linked_account_holdings",
  "media_connections",
] as const;
