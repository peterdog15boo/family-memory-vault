/**
 * User captions on Photos library media (clean/ready only).
 * Distinct from AI captions (`ai_caption` / `scene_caption`).
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, users, type Media } from "@/lib/db/schema";
import {
  MEDIA_CAPTION_MAX_LENGTH,
  type MediaCaptionPayload,
} from "@/lib/media/captions-shared";
import { isSafeToServe } from "@/lib/moderation/types";
import { canEditMedia, canViewMedia } from "@/lib/permissions";

export {
  MEDIA_CAPTION_MAX_LENGTH,
  type MediaCaptionPayload,
} from "@/lib/media/captions-shared";

function assertCleanReady(
  row: Pick<Media, "moderationStatus" | "status">,
): void {
  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    throw new Error("Only clean, ready media can have captions.");
  }
}

/**
 * Trim, collapse whitespace, enforce max length.
 * Empty / whitespace-only → null.
 */
export function normalizeMediaCaption(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > MEDIA_CAPTION_MAX_LENGTH) {
    return trimmed.slice(0, MEDIA_CAPTION_MAX_LENGTH);
  }
  return trimmed;
}

function displayNameHint(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  // Prefer first token to keep “Edited by …” short.
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}

async function loadEditorName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const db = getDb();
  const [row] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return displayNameHint(row?.displayName);
}

function toPayload(
  row: {
    id: string;
    caption: string | null;
    captionUpdatedAt: Date | null;
    captionUpdatedByUserId: string | null;
  },
  canEdit: boolean,
  editorName: string | null,
): MediaCaptionPayload {
  return {
    mediaId: row.id,
    caption: row.caption,
    captionUpdatedAt: row.captionUpdatedAt?.toISOString() ?? null,
    captionUpdatedByUserId: row.captionUpdatedByUserId,
    captionUpdatedByName: editorName,
    canEdit,
  };
}

/**
 * Load caption for a viewer (clean/ready access required).
 */
export async function getMediaCaptionForUser(
  userId: string,
  mediaId: string,
): Promise<MediaCaptionPayload | null> {
  if (!(await canViewMedia(userId, mediaId))) return null;

  const db = getDb();
  const [row] = await db
    .select({
      id: media.id,
      caption: media.caption,
      captionUpdatedAt: media.captionUpdatedAt,
      captionUpdatedByUserId: media.captionUpdatedByUserId,
      moderationStatus: media.moderationStatus,
      status: media.status,
    })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) return null;
  assertCleanReady(row);

  const canEdit = await canEditMedia(userId, mediaId);
  const editorName = await loadEditorName(row.captionUpdatedByUserId);
  return toPayload(row, canEdit, editorName);
}

/**
 * Set or clear caption. Requires canEditMedia (owner or family contribute).
 * Empty string clears to null.
 */
export async function updateMediaCaption(input: {
  userId: string;
  mediaId: string;
  caption: string | null;
}): Promise<MediaCaptionPayload> {
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

  const next = normalizeMediaCaption(input.caption);
  const now = new Date();

  const [updated] = await db
    .update(media)
    .set({
      caption: next,
      captionUpdatedAt: next == null ? null : now,
      captionUpdatedByUserId: next == null ? null : input.userId,
      updatedAt: now,
    })
    .where(eq(media.id, input.mediaId))
    .returning({
      id: media.id,
      caption: media.caption,
      captionUpdatedAt: media.captionUpdatedAt,
      captionUpdatedByUserId: media.captionUpdatedByUserId,
    });

  if (!updated) throw new Error("Failed to update caption.");

  const editorName =
    next == null ? null : await loadEditorName(input.userId);
  return toPayload(updated, true, editorName);
}
