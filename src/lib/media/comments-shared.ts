/**
 * Client-safe media comment constants & payload shapes.
 */

export const MEDIA_COMMENT_MAX_LENGTH = 800;

export type MediaThreadEntryKind = "caption" | "comment";

export type MediaThreadEntry = {
  /** Stable id: `caption` for the original caption row, else comment id. */
  id: string;
  kind: MediaThreadEntryKind;
  body: string;
  authorUserId: string | null;
  authorName: string | null;
  createdAt: string | null;
  editedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

export type MediaCommentThreadPayload = {
  mediaId: string;
  /** Quiet label — family-only surface. */
  familyOnly: true;
  canComment: boolean;
  viewerUserId: string;
  entries: MediaThreadEntry[];
};

/**
 * Skip empty / ultra-generic feed noise for Person Stories (best-effort).
 */
export function isLowSignalMediaComment(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[!?.…♡❤♥️❤️👍👏🔥✨🎉😂😆😅😊😍🥰]+$/gu, "")
    .trim();
  if (!t || t.length < 3) return true;
  const noise = new Set([
    "nice",
    "nice pic",
    "nice photo",
    "nice one",
    "cool",
    "cool pic",
    "love it",
    "love this",
    "so cute",
    "cute",
    "beautiful",
    "gorgeous",
    "amazing",
    "awesome",
    "wow",
    "lol",
    "haha",
    "yes",
    "yay",
    "ok",
    "okay",
  ]);
  return noise.has(t);
}

/**
 * Trim, collapse whitespace, enforce max length. Empty → null.
 */
export function normalizeMediaCommentBody(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > MEDIA_COMMENT_MAX_LENGTH) {
    return trimmed.slice(0, MEDIA_COMMENT_MAX_LENGTH);
  }
  return trimmed;
}
