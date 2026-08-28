/**
 * Person Story feed — human posts about someone, plus AI “Notes from photos”.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  people,
  personStoryPosts,
  users,
  type Person,
} from "@/lib/db/schema";
import {
  PERSON_STORY_POST_MAX_LENGTH,
  normalizePersonStoryPostBody,
  type PersonStoryFeedPayload,
  type PersonStoryNotesView,
  type PersonStoryPostView,
} from "@/lib/people/story-posts-shared";
import { canViewPerson } from "@/lib/permissions";
import {
  personStorySnapshotFromRow,
  regeneratePersonStoryNotes,
} from "@/lib/people/stories";

export {
  PERSON_STORY_POST_MAX_LENGTH,
  normalizePersonStoryPostBody,
  type PersonStoryFeedPayload,
  type PersonStoryNotesView,
  type PersonStoryPostView,
} from "@/lib/people/story-posts-shared";

export class PersonStoryPostError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    options: { status?: number; code?: string } = {},
  ) {
    super(message);
    this.name = "PersonStoryPostError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "validation";
  }
}

function displayNameHint(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || null;
}

async function requireVisiblePerson(
  viewerUserId: string,
  personId: string,
): Promise<Person> {
  if (!(await canViewPerson(viewerUserId, personId))) {
    throw new PersonStoryPostError("Person not found.", {
      status: 404,
      code: "not_found",
    });
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);
  if (!row) {
    throw new PersonStoryPostError("Person not found.", {
      status: 404,
      code: "not_found",
    });
  }
  return row;
}

function notesFromPerson(row: Person): PersonStoryNotesView {
  const snap = personStorySnapshotFromRow(row);
  return {
    body: snap.body,
    sourceCount: snap.sourceCaptionCount,
    generatedAt: snap.generatedAt,
    generatedBy: snap.generatedBy,
  };
}

async function loadAuthorNames(
  userIds: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string | null>();
  if (unique.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, unique));
  for (const row of rows) {
    map.set(row.id, displayNameHint(row.displayName));
  }
  return map;
}

function toPostView(
  row: {
    id: string;
    body: string;
    authorUserId: string;
    createdAt: Date;
    editedAt: Date | null;
  },
  authorName: string | null,
  viewerUserId: string,
  personOwnerId: string,
): PersonStoryPostView {
  const isAuthor = row.authorUserId === viewerUserId;
  const isOwner = personOwnerId === viewerUserId;
  return {
    id: row.id,
    body: row.body,
    authorUserId: row.authorUserId,
    authorName,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    canEdit: isAuthor,
    canDelete: isAuthor || isOwner,
  };
}

/**
 * Full Story feed: human posts (oldest → newest) + photo notes.
 */
export async function getPersonStoryFeed(
  viewerUserId: string,
  personId: string,
): Promise<PersonStoryFeedPayload> {
  const person = await requireVisiblePerson(viewerUserId, personId);
  const db = getDb();
  const posts = await db
    .select()
    .from(personStoryPosts)
    .where(eq(personStoryPosts.personId, personId))
    .orderBy(asc(personStoryPosts.createdAt));

  const names = await loadAuthorNames(posts.map((p) => p.authorUserId));
  const isPersonOwner = person.userId === viewerUserId;

  return {
    personId,
    displayName: person.name,
    posts: posts.map((p) =>
      toPostView(
        p,
        names.get(p.authorUserId) ?? null,
        viewerUserId,
        person.userId,
      ),
    ),
    notes: notesFromPerson(person),
    canPost: true,
    isPersonOwner,
    familyOnly: true,
  };
}

export async function createPersonStoryPost(input: {
  userId: string;
  personId: string;
  body: string;
}): Promise<PersonStoryPostView> {
  const person = await requireVisiblePerson(input.userId, input.personId);
  const body = normalizePersonStoryPostBody(input.body);
  if (!body) {
    throw new PersonStoryPostError("Write something before posting.", {
      status: 400,
      code: "validation",
    });
  }

  const db = getDb();
  const now = new Date();
  const [created] = await db
    .insert(personStoryPosts)
    .values({
      id: nanoid(),
      personId: input.personId,
      authorUserId: input.userId,
      body,
      createdAt: now,
      editedAt: null,
    })
    .returning();

  if (!created) {
    throw new PersonStoryPostError("Could not post story.", {
      status: 500,
      code: "internal",
    });
  }

  const names = await loadAuthorNames([input.userId]);
  return toPostView(
    created,
    names.get(input.userId) ?? null,
    input.userId,
    person.userId,
  );
}

export async function updatePersonStoryPost(input: {
  userId: string;
  personId: string;
  postId: string;
  body: string;
}): Promise<PersonStoryPostView> {
  const person = await requireVisiblePerson(input.userId, input.personId);
  const body = normalizePersonStoryPostBody(input.body);
  if (!body) {
    throw new PersonStoryPostError("Story cannot be empty.", {
      status: 400,
      code: "validation",
    });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(personStoryPosts)
    .where(
      and(
        eq(personStoryPosts.id, input.postId),
        eq(personStoryPosts.personId, input.personId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new PersonStoryPostError("Post not found.", {
      status: 404,
      code: "not_found",
    });
  }
  if (existing.authorUserId !== input.userId) {
    throw new PersonStoryPostError("You can only edit your own posts.", {
      status: 403,
      code: "forbidden",
    });
  }

  const now = new Date();
  const [updated] = await db
    .update(personStoryPosts)
    .set({ body, editedAt: now })
    .where(eq(personStoryPosts.id, input.postId))
    .returning();

  if (!updated) {
    throw new PersonStoryPostError("Post not found.", {
      status: 404,
      code: "not_found",
    });
  }

  const names = await loadAuthorNames([updated.authorUserId]);
  return toPostView(
    updated,
    names.get(updated.authorUserId) ?? null,
    input.userId,
    person.userId,
  );
}

export async function deletePersonStoryPost(input: {
  userId: string;
  personId: string;
  postId: string;
}): Promise<void> {
  const person = await requireVisiblePerson(input.userId, input.personId);
  const db = getDb();
  const [existing] = await db
    .select()
    .from(personStoryPosts)
    .where(
      and(
        eq(personStoryPosts.id, input.postId),
        eq(personStoryPosts.personId, input.personId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new PersonStoryPostError("Post not found.", {
      status: 404,
      code: "not_found",
    });
  }

  const isAuthor = existing.authorUserId === input.userId;
  const isOwner = person.userId === input.userId;
  if (!isAuthor && !isOwner) {
    throw new PersonStoryPostError("You cannot delete this post.", {
      status: 403,
      code: "forbidden",
    });
  }

  await db
    .delete(personStoryPosts)
    .where(eq(personStoryPosts.id, input.postId));
}

/** Refresh AI notes only — never touches human posts. */
export async function refreshPersonStoryNotes(input: {
  userId: string;
  personId: string;
}): Promise<PersonStoryNotesView> {
  await requireVisiblePerson(input.userId, input.personId);
  // Family may refresh; captions are viewer-visible, notes persist on the person.
  const snap = await regeneratePersonStoryNotes({
    userId: input.userId,
    personId: input.personId,
    generatedBy: "user",
  });
  return {
    body: snap.body,
    sourceCount: snap.sourceCaptionCount,
    generatedAt: snap.generatedAt,
    generatedBy: snap.generatedBy,
  };
}
