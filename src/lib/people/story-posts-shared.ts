/**
 * Client-safe Person Story feed shapes (posts + photo notes).
 */

export const PERSON_STORY_POST_MAX_LENGTH = 2000;

export type PersonStoryPostView = {
  id: string;
  body: string;
  authorUserId: string;
  authorName: string | null;
  createdAt: string;
  editedAt: string | null;
  canEdit: boolean;
  canDelete: boolean;
};

export type PersonStoryNotesView = {
  body: string | null;
  sourceCount: number;
  generatedAt: string | null;
  generatedBy: "system" | "user" | null;
};

export type PersonStoryFeedPayload = {
  personId: string;
  displayName: string;
  posts: PersonStoryPostView[];
  notes: PersonStoryNotesView;
  canPost: boolean;
  isPersonOwner: boolean;
  familyOnly: true;
};

export function normalizePersonStoryPostBody(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (trimmed.length > PERSON_STORY_POST_MAX_LENGTH) {
    return trimmed.slice(0, PERSON_STORY_POST_MAX_LENGTH);
  }
  return trimmed;
}
