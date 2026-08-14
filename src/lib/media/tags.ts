/**
 * Media tags — AI keywords (pipeline) + user keywords (manual).
 *
 * Stored separately (`ai_tags` vs `user_tags`) and merged for search.
 * Users may remove AI labels; removals go into `dismissed_ai_tags` and are
 * stripped from AI arrays so search stays correct and re-analysis respects them.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import { isSafeToServe } from "@/lib/moderation/types";
import { canEditMedia, canViewMedia } from "@/lib/permissions";

export type MediaTagSource = "ai" | "user";

export type MediaTagEntry = {
  value: string;
  source: MediaTagSource;
};

export type MediaTagsPayload = {
  mediaId: string;
  aiTags: string[];
  userTags: string[];
  /** Merged visible list with source for UI (AI first, then user). */
  tags: MediaTagEntry[];
  aiObjects: string[];
  aiScenes: string[];
  aiCaption: string | null;
  /** Labels the user removed; suppressed on future AI analysis writes. */
  dismissedAiTags: string[];
  canEdit: boolean;
};

const MAX_USER_TAGS = 48;
const MAX_TAG_LEN = 48;
const MAX_DISMISSED_AI_TAGS = 96;

/**
 * Trim + lowercase; drop empties; case-insensitive unique; stable order.
 */
export function normalizeUserTags(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length < 1) continue;
    if (trimmed.length > MAX_TAG_LEN) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Preserve a readable display form: lowercase for consistency with AI tags.
    out.push(key);
    if (out.length >= MAX_USER_TAGS) break;
  }
  return out;
}

/** Same normalization as user tags, with a higher cap for dismiss history. */
export function normalizeDismissedAiTags(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length < 1) continue;
    if (trimmed.length > MAX_TAG_LEN) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= MAX_DISMISSED_AI_TAGS) break;
  }
  return out;
}

/** Drop labels the user previously removed (case-insensitive). */
export function suppressDismissedLabels(
  labels: string[] | null | undefined,
  dismissed: string[] | null | undefined,
): string[] {
  if (!labels?.length) return [];
  if (!dismissed?.length) return [...labels];
  const banned = new Set(
    dismissed.map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  return labels.filter((t) => !banned.has(t.trim().toLowerCase()));
}

function stripLabels(
  labels: string[] | null | undefined,
  keys: Set<string>,
): string[] {
  if (!labels?.length) return [];
  if (keys.size === 0) return [...labels];
  return labels.filter((t) => !keys.has(t.trim().toLowerCase()));
}

function labelSetHas(
  labels: string[] | null | undefined,
  key: string,
): boolean {
  return (labels ?? []).some((t) => t.trim().toLowerCase() === key);
}

export function mergeMediaTagEntries(input: {
  aiTags?: string[] | null;
  userTags?: string[] | null;
  aiObjects?: string[] | null;
  aiScenes?: string[] | null;
  sceneTags?: string[] | null;
  dismissedAiTags?: string[] | null;
}): MediaTagEntry[] {
  const entries: MediaTagEntry[] = [];
  const seen = new Set<string>();
  const dismissed = new Set(
    (input.dismissedAiTags ?? [])
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );

  const push = (value: string, source: MediaTagSource) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    if (source === "ai" && dismissed.has(key)) return;
    seen.add(key);
    entries.push({ value: key, source });
  };

  for (const t of input.aiTags ?? []) push(t, "ai");
  for (const t of input.sceneTags ?? []) push(t, "ai");
  for (const t of input.aiObjects ?? []) push(t, "ai");
  for (const t of input.aiScenes ?? []) push(t, "ai");
  for (const t of input.userTags ?? []) push(t, "user");

  return entries;
}

function assertCleanReady(
  row: Pick<Media, "moderationStatus" | "status">,
): void {
  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    throw new Error("Only clean, ready media can have tags.");
  }
}

type MediaTagRow = Pick<
  Media,
  | "id"
  | "aiTags"
  | "userTags"
  | "aiObjects"
  | "aiScenes"
  | "sceneTags"
  | "aiCaption"
  | "dismissedAiTags"
>;

function toPayload(row: MediaTagRow, canEdit: boolean): MediaTagsPayload {
  const dismissedAiTags = normalizeDismissedAiTags(row.dismissedAiTags ?? []);
  const aiTags = suppressDismissedLabels(row.aiTags, dismissedAiTags);
  const aiObjects = suppressDismissedLabels(row.aiObjects, dismissedAiTags);
  const aiScenes = suppressDismissedLabels(row.aiScenes, dismissedAiTags);
  const sceneTags = suppressDismissedLabels(row.sceneTags, dismissedAiTags);
  const userTags = row.userTags ?? [];

  return {
    mediaId: row.id,
    aiTags,
    userTags,
    tags: mergeMediaTagEntries({
      aiTags,
      userTags,
      aiObjects,
      aiScenes,
      sceneTags,
      dismissedAiTags,
    }),
    aiObjects,
    aiScenes,
    aiCaption: row.aiCaption,
    dismissedAiTags,
    canEdit,
  };
}

/**
 * Load AI + user tags for a viewer (clean/ready access required).
 */
export async function getMediaTagsForUser(
  userId: string,
  mediaId: string,
): Promise<MediaTagsPayload | null> {
  if (!(await canViewMedia(userId, mediaId))) return null;

  const db = getDb();
  const [row] = await db
    .select({
      id: media.id,
      userId: media.userId,
      aiTags: media.aiTags,
      userTags: media.userTags,
      aiObjects: media.aiObjects,
      aiScenes: media.aiScenes,
      sceneTags: media.sceneTags,
      aiCaption: media.aiCaption,
      dismissedAiTags: media.dismissedAiTags,
      moderationStatus: media.moderationStatus,
      status: media.status,
    })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) return null;
  assertCleanReady(row);

  const canEdit = await canEditMedia(userId, mediaId);
  return toPayload(row, canEdit);
}

export type UpdateMediaTagsInput = {
  userId: string;
  mediaId: string;
  /** Full replace of user tags when provided. */
  userTags?: string[];
  /** Add these tags (normalized) into the existing user set. */
  add?: string[];
  /**
   * Remove these tags (case-insensitive).
   * Removes from user tags; if present on AI label arrays, also dismisses them.
   */
  remove?: string[];
};

/** @deprecated Prefer UpdateMediaTagsInput — same shape. */
export type UpdateUserTagsInput = UpdateMediaTagsInput;

/**
 * Add / remove / replace tags. Requires canEditMedia (owner or family contribute).
 * Removing an AI label persists it in dismissed_ai_tags and strips AI arrays.
 */
export async function updateMediaUserTags(
  input: UpdateMediaTagsInput,
): Promise<MediaTagsPayload> {
  if (!(await canEditMedia(input.userId, input.mediaId))) {
    throw new Error("Media not found.");
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, input.mediaId))
    .limit(1);

  if (!row) throw new Error("Media not found.");
  assertCleanReady(row);

  let nextUser: string[];
  if (input.userTags) {
    nextUser = normalizeUserTags(input.userTags);
  } else {
    nextUser = normalizeUserTags(row.userTags ?? []);
    if (input.add?.length) {
      nextUser = normalizeUserTags([...nextUser, ...input.add]);
    }
  }

  let nextAiTags = row.aiTags ?? [];
  let nextAiObjects = row.aiObjects ?? [];
  let nextAiScenes = row.aiScenes ?? [];
  let nextSceneTags = row.sceneTags ?? [];
  let nextDismissed = normalizeDismissedAiTags(row.dismissedAiTags ?? []);

  if (input.remove?.length) {
    const removeKeys = new Set(
      input.remove.map((t) => t.trim().toLowerCase()).filter(Boolean),
    );
    nextUser = nextUser.filter((t) => !removeKeys.has(t));

    const aiDismissKeys = new Set<string>();
    for (const key of removeKeys) {
      if (
        labelSetHas(row.aiTags, key) ||
        labelSetHas(row.aiObjects, key) ||
        labelSetHas(row.aiScenes, key) ||
        labelSetHas(row.sceneTags, key) ||
        labelSetHas(row.dismissedAiTags, key)
      ) {
        aiDismissKeys.add(key);
      }
    }

    if (aiDismissKeys.size > 0) {
      nextAiTags = stripLabels(nextAiTags, aiDismissKeys);
      nextAiObjects = stripLabels(nextAiObjects, aiDismissKeys);
      nextAiScenes = stripLabels(nextAiScenes, aiDismissKeys);
      nextSceneTags = stripLabels(nextSceneTags, aiDismissKeys);
      nextDismissed = normalizeDismissedAiTags([
        ...nextDismissed,
        ...aiDismissKeys,
      ]);
    }
  }

  const [updated] = await db
    .update(media)
    .set({
      userTags: nextUser,
      aiTags: nextAiTags,
      aiObjects: nextAiObjects,
      aiScenes: nextAiScenes,
      sceneTags: nextSceneTags,
      dismissedAiTags: nextDismissed,
      updatedAt: new Date(),
    })
    .where(eq(media.id, input.mediaId))
    .returning();

  if (!updated) throw new Error("Failed to update tags.");

  return toPayload(updated, true);
}
