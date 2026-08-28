/**
 * Family-only mini feed under Photos library media (clean/ready only).
 * Original `media.caption` is the first entry when present; later notes live
 * in `media_comments`.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { media, mediaComments, users, type Media } from "@/lib/db/schema";
import {
  MEDIA_COMMENT_MAX_LENGTH,
  isLowSignalMediaComment,
  normalizeMediaCommentBody,
  type MediaCommentThreadPayload,
  type MediaThreadEntry,
} from "@/lib/media/comments-shared";
import { isSafeToServe } from "@/lib/moderation/types";
import { canEditMedia, canViewMedia } from "@/lib/permissions";

export {
  MEDIA_COMMENT_MAX_LENGTH,
  isLowSignalMediaComment,
  normalizeMediaCommentBody,
  type MediaCommentThreadPayload,
  type MediaThreadEntry,
} from "@/lib/media/comments-shared";

export class MediaCommentError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    options: { status?: number; code?: string } = {},
  ) {
    super(message);
    this.name = "MediaCommentError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "validation";
  }
}

function assertCleanReady(
  row: Pick<Media, "moderationStatus" | "status">,
): void {
  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    throw new MediaCommentError("Only clean, ready media can have comments.", {
      status: 403,
      code: "forbidden",
    });
  }
}

function displayNameHint(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || null;
}

async function loadAuthorNames(
  userIds: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string | null>();
  if (unique.length === 0) return map;

  const db = getDb();
  const all = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, unique));

  for (const row of all) {
    map.set(row.id, displayNameHint(row.displayName));
  }
  return map;
}

async function requireViewableMedia(
  userId: string,
  mediaId: string,
): Promise<Media> {
  if (!(await canViewMedia(userId, mediaId))) {
    throw new MediaCommentError("Media not found.", {
      status: 404,
      code: "not_found",
    });
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);
  if (!row) {
    throw new MediaCommentError("Media not found.", {
      status: 404,
      code: "not_found",
    });
  }
  assertCleanReady(row);
  return row;
}

/**
 * Load the family mini-feed: original caption (if any) then comments.
 * Anyone who can view the media can comment.
 */
export async function getMediaCommentThread(
  viewerUserId: string,
  mediaId: string,
): Promise<MediaCommentThreadPayload> {
  const row = await requireViewableMedia(viewerUserId, mediaId);
  const canEditCaption = await canEditMedia(viewerUserId, mediaId);
  const isMediaOwner = row.userId === viewerUserId;

  const db = getDb();
  const commentRows = await db
    .select({
      id: mediaComments.id,
      userId: mediaComments.userId,
      body: mediaComments.body,
      createdAt: mediaComments.createdAt,
      editedAt: mediaComments.editedAt,
    })
    .from(mediaComments)
    .where(eq(mediaComments.mediaId, mediaId))
    .orderBy(asc(mediaComments.createdAt));

  const authorIds = [
    ...(row.captionUpdatedByUserId ? [row.captionUpdatedByUserId] : []),
    ...(!row.captionUpdatedByUserId && row.caption ? [row.userId] : []),
    ...commentRows.map((c) => c.userId),
  ];
  const names = await loadAuthorNames(authorIds);

  const entries: MediaThreadEntry[] = [];

  const captionBody = row.caption?.trim().replace(/\s+/g, " ") ?? "";
  if (captionBody) {
    const authorId = row.captionUpdatedByUserId ?? row.userId;
    entries.push({
      id: "caption",
      kind: "caption",
      body: captionBody,
      authorUserId: authorId,
      authorName: names.get(authorId) ?? null,
      createdAt: row.captionUpdatedAt?.toISOString() ?? null,
      editedAt: null,
      canEdit: canEditCaption,
      canDelete: canEditCaption,
    });
  }

  for (const c of commentRows) {
    const isAuthor = c.userId === viewerUserId;
    entries.push({
      id: c.id,
      kind: "comment",
      body: c.body,
      authorUserId: c.userId,
      authorName: names.get(c.userId) ?? null,
      createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt?.toISOString() ?? null,
      canEdit: isAuthor,
      canDelete: isAuthor || isMediaOwner,
    });
  }

  return {
    mediaId,
    familyOnly: true,
    canComment: true,
    viewerUserId,
    entries,
  };
}

export async function createMediaComment(input: {
  userId: string;
  mediaId: string;
  body: string;
}): Promise<MediaThreadEntry> {
  await requireViewableMedia(input.userId, input.mediaId);

  const body = normalizeMediaCommentBody(input.body);
  if (!body) {
    throw new MediaCommentError("Write something before posting.", {
      status: 400,
      code: "validation",
    });
  }

  const db = getDb();
  const now = new Date();
  const id = nanoid();
  const [created] = await db
    .insert(mediaComments)
    .values({
      id,
      mediaId: input.mediaId,
      userId: input.userId,
      body,
      createdAt: now,
      editedAt: null,
    })
    .returning();

  if (!created) {
    throw new MediaCommentError("Could not post comment.", {
      status: 500,
      code: "internal",
    });
  }

  const names = await loadAuthorNames([input.userId]);
  return {
    id: created.id,
    kind: "comment",
    body: created.body,
    authorUserId: created.userId,
    authorName: names.get(created.userId) ?? null,
    createdAt: created.createdAt.toISOString(),
    editedAt: null,
    canEdit: true,
    canDelete: true,
  };
}

export async function updateMediaComment(input: {
  userId: string;
  mediaId: string;
  commentId: string;
  body: string;
}): Promise<MediaThreadEntry> {
  await requireViewableMedia(input.userId, input.mediaId);
  const body = normalizeMediaCommentBody(input.body);
  if (!body) {
    throw new MediaCommentError("Comment cannot be empty.", {
      status: 400,
      code: "validation",
    });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(mediaComments)
    .where(
      and(
        eq(mediaComments.id, input.commentId),
        eq(mediaComments.mediaId, input.mediaId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new MediaCommentError("Comment not found.", {
      status: 404,
      code: "not_found",
    });
  }
  if (existing.userId !== input.userId) {
    throw new MediaCommentError("You can only edit your own comments.", {
      status: 403,
      code: "forbidden",
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(mediaComments)
    .set({ body, editedAt: now })
    .where(eq(mediaComments.id, input.commentId))
    .returning();

  if (!updated) {
    throw new MediaCommentError("Comment not found.", {
      status: 404,
      code: "not_found",
    });
  }

  const names = await loadAuthorNames([updated.userId]);
  return {
    id: updated.id,
    kind: "comment",
    body: updated.body,
    authorUserId: updated.userId,
    authorName: names.get(updated.userId) ?? null,
    createdAt: updated.createdAt.toISOString(),
    editedAt: updated.editedAt?.toISOString() ?? null,
    canEdit: true,
    canDelete: true,
  };
}

export async function deleteMediaComment(input: {
  userId: string;
  mediaId: string;
  commentId: string;
}): Promise<void> {
  const mediaRow = await requireViewableMedia(input.userId, input.mediaId);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(mediaComments)
    .where(
      and(
        eq(mediaComments.id, input.commentId),
        eq(mediaComments.mediaId, input.mediaId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new MediaCommentError("Comment not found.", {
      status: 404,
      code: "not_found",
    });
  }

  const isAuthor = existing.userId === input.userId;
  const isMediaOwner = mediaRow.userId === input.userId;
  if (!isAuthor && !isMediaOwner) {
    throw new MediaCommentError("You cannot delete this comment.", {
      status: 403,
      code: "forbidden",
    });
  }

  await db
    .delete(mediaComments)
    .where(eq(mediaComments.id, input.commentId));
}

/**
 * List comment bodies on media ids (for Person Stories). Oldest → newest.
 */
export async function listCommentBodiesForMediaIds(
  mediaIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (mediaIds.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select({
      mediaId: mediaComments.mediaId,
      body: mediaComments.body,
      createdAt: mediaComments.createdAt,
    })
    .from(mediaComments)
    .where(inArray(mediaComments.mediaId, mediaIds))
    .orderBy(asc(mediaComments.createdAt));

  for (const row of rows) {
    const list = map.get(row.mediaId) ?? [];
    list.push(row.body);
    map.set(row.mediaId, list);
  }
  return map;
}
