/**
 * Memory (album / story) helpers.
 *
 * SAFETY: every read path that returns media for a memory only includes items
 * with moderation_status = clean and status = ready. Writes that attach media
 * (cover or members) reject anything that is not clean + ready and accessible
 * to the memory owner (owned or family-shared).
 */

import { and, asc, count, desc, eq, inArray, max } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  media,
  memories,
  memoryMedia,
  MEMORY_FAMILY_ACCESS_LEVELS,
  MEMORY_TYPES,
  type Media,
  type Memory,
  type MemoryFamilyAccess,
  type MemoryType,
  type NewMemory,
} from "@/lib/db/schema";
import {
  cleanReadyMediaFilter,
  cleanReadyMediaOwnedByFilter,
  loadCleanAccessibleMediaByIds,
  toSafeMediaItem,
  type SafeMediaItem,
} from "@/lib/media/queries";
import {
  canEditMemory,
  canViewMemory,
  getAccessibleOwnerIds,
} from "@/lib/permissions";
import {
  mergeMemorySettings,
  memorySettingsSchema,
  type MemorySettings,
} from "@/lib/memories/settings";
import { MemoryError } from "@/lib/memories/errors";

export type { MemorySettings };
export { MemoryError } from "@/lib/memories/errors";
export {
  DEFAULT_SLIDESHOW_SETTINGS,
  normalizeSlideshowSettings,
  SLIDESHOW_TRANSITIONS,
  type SlideshowSettings,
  type SlideshowTransition,
} from "@/lib/memories/settings";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type { Memory, MemoryFamilyAccess, MemoryType, NewMemory };
export { MEMORY_FAMILY_ACCESS_LEVELS };

/** Clean media item as it appears inside a memory (with join metadata). */
export type MemoryMediaItem = SafeMediaItem & {
  sortOrder: number;
  caption: string | null;
  addedAt: Date;
};

/** Full memory detail for family UI — media list is clean-only. */
export type MemoryWithMedia = {
  id: string;
  userId: string;
  type: MemoryType;
  title: string;
  description: string | null;
  coverMediaId: string | null;
  settings: MemorySettings;
  sharedWithFamily: boolean;
  familyAccess: MemoryFamilyAccess;
  createdAt: Date;
  updatedAt: Date;
  /** Cover preview only when the cover media is clean + ready. */
  cover: SafeMediaItem | null;
  /** Linked media that currently passes the clean/ready gate, ordered. */
  media: MemoryMediaItem[];
};

/** Compact row for memory list screens. */
export type MemoryListItem = {
  id: string;
  userId: string;
  type: MemoryType;
  title: string;
  description: string | null;
  coverMediaId: string | null;
  settings: MemorySettings;
  sharedWithFamily: boolean;
  familyAccess: MemoryFamilyAccess;
  createdAt: Date;
  updatedAt: Date;
  /** Count of clean + ready members only. */
  mediaCount: number;
  /** Cover preview only when clean + ready; otherwise null. */
  cover: SafeMediaItem | null;
  /** True when this memory belongs to the listing viewer. */
  isOwned: boolean;
};

/** Split memory library for My Library vs Shared with Family. */
export type MemoryLibrary = {
  own: MemoryListItem[];
  shared: MemoryListItem[];
  hasFamilySharing: boolean;
  ownHasMore: boolean;
  sharedHasMore: boolean;
};

export type CreateMemoryInput = {
  userId: string;
  title: string;
  description?: string | null;
  type?: MemoryType;
  coverMediaId?: string | null;
  /** Additional clean media to attach (cover is included automatically if set). */
  mediaIds?: string[];
};

export type AddMediaToMemoryResult = {
  memoryId: string;
  addedMediaIds: string[];
  skippedMediaIds: string[];
};

const createMemorySchema = z.object({
  userId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  type: z.enum(MEMORY_TYPES).optional().default("album"),
  coverMediaId: z.string().min(1).nullable().optional(),
  mediaIds: z.array(z.string().min(1)).optional().default([]),
});

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

async function getOwnedMemory(
  memoryId: string,
  userId: string,
): Promise<Memory> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
    .limit(1);

  if (!row) {
    throw new MemoryError("Memory not found.");
  }
  return row;
}

/**
 * Load clean + ready media the user may use (own + family-shared).
 * Order of returned rows is not guaranteed — callers re-sort as needed.
 */
async function loadCleanOwnedMedia(
  userId: string,
  mediaIds: string[],
): Promise<Media[]> {
  return loadCleanAccessibleMediaByIds(userId, mediaIds);
}

/**
 * Load clean + ready media among ids for any of the given owners
 * (covers on shared family memories).
 */
async function loadCleanMediaForOwners(
  ownerIds: string[],
  mediaIds: string[],
): Promise<Media[]> {
  if (mediaIds.length === 0 || ownerIds.length === 0) return [];

  const db = getDb();
  return db
    .select()
    .from(media)
    .where(
      and(
        cleanReadyMediaOwnedByFilter(ownerIds),
        inArray(media.id, mediaIds),
      ),
    );
}

async function resolveCover(
  userId: string,
  coverMediaId: string | null,
): Promise<SafeMediaItem | null> {
  if (!coverMediaId) return null;
  const [row] = await loadCleanOwnedMedia(userId, [coverMediaId]);
  if (!row) return null;
  return toSafeMediaItem(row);
}

function memoryBaseFields(
  row: Memory,
): Omit<MemoryWithMedia, "cover" | "media"> {
  const familyAccess: MemoryFamilyAccess =
    row.familyAccess === "contribute" ? "contribute" : "view";
  return {
    id: row.id,
    userId: row.userId,
    type: row.type === "story" ? ("story" as const) : ("album" as const),
    title: row.title,
    description: row.description ?? null,
    coverMediaId: row.coverMediaId ?? null,
    // Legacy rows may lack jsonb defaults after older migrations — never hide UI.
    settings: (row.settings ?? {}) as MemorySettings,
    sharedWithFamily: Boolean(row.sharedWithFamily),
    familyAccess,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function touchMemory(memoryId: string): Promise<void> {
  const db = getDb();
  await db
    .update(memories)
    .set({ updatedAt: new Date() })
    .where(eq(memories.id, memoryId));
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Create an album or story. Optional cover must be the owner's clean media;
 * when set, the cover is also linked into `memory_media` at sortOrder 0.
 */
export async function createMemory(
  input: CreateMemoryInput,
): Promise<MemoryWithMedia> {
  const parsed = createMemorySchema.parse(input);
  const db = getDb();
  const now = new Date();
  const id = nanoid();

  const coverMediaId: string | null = parsed.coverMediaId ?? null;
  if (coverMediaId) {
    const [cover] = await loadCleanOwnedMedia(parsed.userId, [coverMediaId]);
    if (!cover) {
      throw new MemoryError(
        "Cover media must be clean / ready and accessible to you.",
      );
    }
  }

  await db.insert(memories).values({
    id,
    userId: parsed.userId,
    type: parsed.type,
    title: parsed.title,
    description: parsed.description ?? null,
    coverMediaId,
    settings: {},
    sharedWithFamily: false,
    familyAccess: "view",
    createdAt: now,
    updatedAt: now,
  });

  if (coverMediaId) {
    await db.insert(memoryMedia).values({
      memoryId: id,
      mediaId: coverMediaId,
      sortOrder: 0,
      caption: null,
      addedAt: now,
    });
  }

  const extraIds = (parsed.mediaIds ?? []).filter(
    (mediaId) => mediaId && mediaId !== coverMediaId,
  );
  if (extraIds.length > 0) {
    await addMediaToMemory(id, extraIds, { userId: parsed.userId });
  }

  const created = await getMemoryWithMedia(id, parsed.userId);
  if (!created) {
    throw new MemoryError("Failed to load memory after create.");
  }

  const { afterMemoryCreated } = await import("@/lib/gamification/memory-created");
  void afterMemoryCreated({
    userId: parsed.userId,
    memoryId: created.id,
    memoryKind: parsed.type === "story" ? "story" : "album",
    title: created.title,
  });

  return created;
}

/**
 * Attach clean / ready media the memory owner can access
 * (owned or family-shared).
 *
 * SAFETY: `userId` is required. Only media with moderation_status=clean and
 * status=ready that the user may view can be linked. Unclean, quarantined,
 * unauthorized, or unknown ids are skipped (never inserted).
 */
export async function addMediaToMemory(
  memoryId: string,
  mediaIds: string[],
  options: { userId: string },
): Promise<AddMediaToMemoryResult> {
  if (!options?.userId?.trim()) {
    throw new MemoryError("Memory not found.");
  }

  const uniqueIds = [...new Set(mediaIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { memoryId, addedMediaIds: [], skippedMediaIds: [] };
  }

  // Ownership gate — non-owners get the same 404-style error (no leakage).
  const memoryRow = await getOwnedMemory(memoryId, options.userId);
  const ownerId = memoryRow.userId;
  const db = getDb();

  // Only clean + ready + accessible to this user may be linked.
  const cleanRows = await loadCleanOwnedMedia(ownerId, uniqueIds);
  const cleanIds = new Set(cleanRows.map((r) => r.id));

  const existing = await db
    .select({ mediaId: memoryMedia.mediaId })
    .from(memoryMedia)
    .where(
      and(
        eq(memoryMedia.memoryId, memoryId),
        inArray(memoryMedia.mediaId, uniqueIds),
      ),
    );
  const alreadyLinked = new Set(existing.map((r) => r.mediaId));

  const toAdd = uniqueIds.filter(
    (id) => cleanIds.has(id) && !alreadyLinked.has(id),
  );
  const skippedMediaIds = uniqueIds.filter((id) => !toAdd.includes(id));

  if (toAdd.length === 0) {
    return { memoryId, addedMediaIds: [], skippedMediaIds };
  }

  // Defense in depth: never insert an id that failed the clean gate.
  const verified = await loadCleanOwnedMedia(ownerId, toAdd);
  if (verified.length !== toAdd.length) {
    throw new MemoryError(
      "One or more media items are not clean / ready and cannot be added.",
    );
  }

  const [agg] = await db
    .select({ maxSort: max(memoryMedia.sortOrder) })
    .from(memoryMedia)
    .where(eq(memoryMedia.memoryId, memoryId));

  let nextSort = (agg?.maxSort ?? -1) + 1;
  const now = new Date();
  const verifiedIds = verified.map((row) => row.id);

  await db.insert(memoryMedia).values(
    verifiedIds.map((mediaId) => {
      const row = {
        memoryId,
        mediaId,
        sortOrder: nextSort,
        caption: null as string | null,
        addedAt: now,
      };
      nextSort += 1;
      return row;
    }),
  );

  await touchMemory(memoryId);

  return { memoryId, addedMediaIds: verifiedIds, skippedMediaIds };
}

/**
 * Remove a media link from a memory. If it was the cover, clears coverMediaId.
 * Requires the calling user to own the memory.
 */
export async function removeMediaFromMemory(
  memoryId: string,
  mediaId: string,
  options: { userId: string },
): Promise<Memory> {
  if (!options?.userId?.trim()) {
    throw new MemoryError("Memory not found.");
  }

  const memory = await getOwnedMemory(memoryId, options.userId);
  const db = getDb();

  await db
    .delete(memoryMedia)
    .where(
      and(
        eq(memoryMedia.memoryId, memoryId),
        eq(memoryMedia.mediaId, mediaId),
      ),
    );

  const clearCover = memory.coverMediaId === mediaId;
  const [updated] = await db
    .update(memories)
    .set({
      ...(clearCover ? { coverMediaId: null } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(memories.id, memoryId), eq(memories.userId, options.userId)),
    )
    .returning();

  return (
    updated ?? {
      ...memory,
      coverMediaId: clearCover ? null : memory.coverMediaId,
    }
  );
}

/**
 * Load one memory the viewer can access (own or shared family), with clean/ready
 * media only. Returns null when missing or not viewable.
 */
export async function getMemoryWithMedia(
  memoryId: string,
  userId: string,
): Promise<MemoryWithMedia | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);

  if (!row) return null;
  if (!(await canViewMemory(userId, memoryId))) return null;

  const links = await db
    .select({
      media: media,
      sortOrder: memoryMedia.sortOrder,
      caption: memoryMedia.caption,
      addedAt: memoryMedia.addedAt,
    })
    .from(memoryMedia)
    .innerJoin(media, eq(memoryMedia.mediaId, media.id))
    .where(
      and(
        eq(memoryMedia.memoryId, memoryId),
        // SAFETY GATE — clean + ready media owned by the memory owner
        cleanReadyMediaFilter(row.userId),
      ),
    )
    .orderBy(asc(memoryMedia.sortOrder), asc(memoryMedia.addedAt));

  const mediaItems: MemoryMediaItem[] = [];
  for (const link of links) {
    const safe = await toSafeMediaItem(link.media);
    if (!safe) continue;
    mediaItems.push({
      ...safe,
      sortOrder: link.sortOrder,
      caption: link.caption,
      addedAt: link.addedAt,
    });
  }

  const coverFromList = row.coverMediaId
    ? mediaItems.find((m) => m.id === row.coverMediaId)
    : undefined;

  const coverSafe: SafeMediaItem | null = coverFromList
    ? {
        id: coverFromList.id,
        userId: coverFromList.userId,
        type: coverFromList.type,
        contentType: coverFromList.contentType,
        originalFilename: coverFromList.originalFilename,
        createdAt: coverFromList.createdAt,
        previewUrl: coverFromList.previewUrl,
        hasThumbnail: coverFromList.hasThumbnail,
      }
    : await resolveCover(row.userId, row.coverMediaId);

  return {
    ...memoryBaseFields(row),
    // Hide unclean cover id from clients so UI never tries to load it.
    coverMediaId: coverSafe ? row.coverMediaId : null,
    cover: coverSafe,
    media: mediaItems,
  };
}

/**
 * List the user's own memories (newest first). Covers and counts are clean-only.
 */
export async function listUserMemories(
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<MemoryListItem[]> {
  const library = await listMemoryLibrary(userId, {
    ownLimit: options?.limit,
    sharedLimit: 0,
    offset: options?.offset,
  });
  return library.own;
}

/**
 * Build MemoryListItem rows for memories owned by any of `ownerIds`.
 * Covers/counts use clean+ready media for those owners (family-safe).
 * When `onlySharedWithFamily` is true, only explicitly shared memories are returned.
 */
async function buildMemoryListItems(options: {
  viewerId: string;
  ownerIds: string[];
  limit: number;
  offset: number;
  onlySharedWithFamily?: boolean;
}): Promise<MemoryListItem[]> {
  const {
    viewerId,
    ownerIds,
    limit,
    offset,
    onlySharedWithFamily = false,
  } = options;
  if (ownerIds.length === 0 || limit <= 0) return [];

  const db = getDb();
  const ownershipFilter = onlySharedWithFamily
    ? and(
        inArray(memories.userId, ownerIds),
        eq(memories.sharedWithFamily, true),
      )
    : inArray(memories.userId, ownerIds);

  const rows = await db
    .select()
    .from(memories)
    .where(ownershipFilter)
    .orderBy(desc(memories.createdAt))
    .limit(limit)
    .offset(offset);

  if (rows.length === 0) return [];

  const memoryIds = rows.map((r) => r.id);
  const memoryOwnerIds = [...new Set(rows.map((r) => r.userId))];

  // Clean-only member counts — do not scope to viewer; media belongs to memory owners.
  const countRows = await db
    .select({
      memoryId: memoryMedia.memoryId,
      value: count(),
    })
    .from(memoryMedia)
    .innerJoin(media, eq(memoryMedia.mediaId, media.id))
    .where(
      and(
        inArray(memoryMedia.memoryId, memoryIds),
        inArray(media.userId, memoryOwnerIds),
        eq(media.moderationStatus, "clean"),
        eq(media.status, "ready"),
      ),
    )
    .groupBy(memoryMedia.memoryId);

  const countByMemory = new Map(
    countRows.map((r) => [r.memoryId, Number(r.value)]),
  );

  const coverIds = rows
    .map((r) => r.coverMediaId)
    .filter((id): id is string => Boolean(id));

  const coverRows =
    coverIds.length > 0
      ? await loadCleanMediaForOwners(memoryOwnerIds, coverIds)
      : [];
  const coverById = new Map(
    (
      await Promise.all(
        coverRows.map(async (row) => {
          const safe = await toSafeMediaItem(row);
          return safe ? ([row.id, safe] as const) : null;
        }),
      )
    ).filter((entry): entry is readonly [string, SafeMediaItem] =>
      Boolean(entry),
    ),
  );

  return rows.map((row) => {
    const cover = row.coverMediaId
      ? (coverById.get(row.coverMediaId) ?? null)
      : null;
    return {
      ...memoryBaseFields(row),
      coverMediaId: cover ? row.coverMediaId : null,
      mediaCount: countByMemory.get(row.id) ?? 0,
      cover,
      isOwned: row.userId === viewerId,
    };
  });
}

/**
 * Split memories into My Library vs Shared with Family.
 * Uses `memories_user_id_created_at_idx` / `memories_user_shared_created_idx`.
 * Fetches limit+1 to detect another page.
 */
export async function listMemoryLibrary(
  userId: string,
  options?: {
    ownLimit?: number;
    sharedLimit?: number;
    offset?: number;
    ownOffset?: number;
    sharedOffset?: number;
  },
): Promise<MemoryLibrary> {
  const ownLimit = Math.min(Math.max(options?.ownLimit ?? 48, 0), 100);
  const sharedLimit = Math.min(Math.max(options?.sharedLimit ?? 48, 0), 100);
  const ownOffset = Math.max(
    options?.ownOffset ?? options?.offset ?? 0,
    0,
  );
  const sharedOffset = Math.max(options?.sharedOffset ?? 0, 0);

  const ownerIds = await getAccessibleOwnerIds(userId);
  const sharedOwnerIds = ownerIds.filter((id) => id !== userId);
  const hasFamilySharing = sharedOwnerIds.length > 0;

  const [ownRaw, sharedRaw] = await Promise.all([
    buildMemoryListItems({
      viewerId: userId,
      ownerIds: [userId],
      limit: ownLimit > 0 ? ownLimit + 1 : 0,
      offset: ownOffset,
    }),
    hasFamilySharing && sharedLimit > 0
      ? buildMemoryListItems({
          viewerId: userId,
          ownerIds: sharedOwnerIds,
          limit: sharedLimit + 1,
          offset: sharedOffset,
          onlySharedWithFamily: true,
        })
      : Promise.resolve([] as MemoryListItem[]),
  ]);

  const ownHasMore = ownRaw.length > ownLimit;
  const sharedHasMore = sharedRaw.length > sharedLimit;

  return {
    own: ownHasMore ? ownRaw.slice(0, ownLimit) : ownRaw,
    shared: sharedHasMore ? sharedRaw.slice(0, sharedLimit) : sharedRaw,
    hasFamilySharing,
    ownHasMore,
    sharedHasMore,
  };
}

/**
 * One page of memories for load-more (own or shared-with-family).
 */
export async function listMemoryPage(
  userId: string,
  scope: "own" | "shared",
  options?: { limit?: number; offset?: number },
): Promise<{ items: MemoryListItem[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(options?.limit ?? 48, 1), 48);
  const offset = Math.max(options?.offset ?? 0, 0);

  if (scope === "own") {
    const raw = await buildMemoryListItems({
      viewerId: userId,
      ownerIds: [userId],
      limit: limit + 1,
      offset,
    });
    const hasMore = raw.length > limit;
    return {
      items: hasMore ? raw.slice(0, limit) : raw,
      hasMore,
    };
  }

  const ownerIds = await getAccessibleOwnerIds(userId);
  const sharedOwnerIds = ownerIds.filter((id) => id !== userId);
  if (sharedOwnerIds.length === 0) {
    return { items: [], hasMore: false };
  }

  const raw = await buildMemoryListItems({
    viewerId: userId,
    ownerIds: sharedOwnerIds,
    limit: limit + 1,
    offset,
    onlySharedWithFamily: true,
  });
  const hasMore = raw.length > limit;
  return {
    items: hasMore ? raw.slice(0, limit) : raw,
    hasMore,
  };
}

/**
 * Update title / description / settings.
 * Owner always; family contributors when memory is shared as contribute.
 * Use setMemoryCover / setMemoryFamilySharing for cover and sharing.
 */
export async function updateMemory(
  memoryId: string,
  userId: string,
  patch: {
    title?: string;
    description?: string | null;
    settings?: MemorySettings;
  },
): Promise<MemoryWithMedia> {
  if (!(await canEditMemory(userId, memoryId))) {
    throw new MemoryError("Memory not found.");
  }

  const db = getDb();
  const [memory] = await db
    .select()
    .from(memories)
    .where(eq(memories.id, memoryId))
    .limit(1);
  if (!memory) {
    throw new MemoryError("Memory not found.");
  }

  const nextTitle =
    patch.title !== undefined ? patch.title.trim() : memory.title;
  if (!nextTitle) {
    throw new MemoryError("Title cannot be empty.");
  }
  if (nextTitle.length > 200) {
    throw new MemoryError("Title is too long.");
  }

  const nextDescription =
    patch.description === undefined
      ? memory.description
      : patch.description === null
        ? null
        : patch.description.trim() || null;

  if (nextDescription && nextDescription.length > 5000) {
    throw new MemoryError("Description is too long.");
  }

  let nextSettings = (memory.settings ?? {}) as MemorySettings;
  if (patch.settings !== undefined) {
    const parsed = memorySettingsSchema.safeParse(patch.settings);
    if (!parsed.success) {
      throw new MemoryError("Invalid memory settings.");
    }
    nextSettings = mergeMemorySettings(nextSettings, parsed.data);
  }

  await db
    .update(memories)
    .set({
      title: nextTitle,
      description: nextDescription,
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(memories.id, memory.id));

  const updated = await getMemoryWithMedia(memoryId, userId);
  if (!updated) {
    throw new MemoryError("Failed to load memory after update.");
  }
  return updated;
}

/**
 * Owner-only: enable/disable family sharing and set view vs contribute access.
 */
export async function setMemoryFamilySharing(
  memoryId: string,
  userId: string,
  options: {
    sharedWithFamily: boolean;
    familyAccess?: MemoryFamilyAccess;
  },
): Promise<MemoryWithMedia> {
  const memory = await getOwnedMemory(memoryId, userId);

  let familyAccess: MemoryFamilyAccess = memory.familyAccess;
  if (options.familyAccess !== undefined) {
    if (
      !(MEMORY_FAMILY_ACCESS_LEVELS as readonly string[]).includes(
        options.familyAccess,
      )
    ) {
      throw new MemoryError("Invalid family access level.");
    }
    familyAccess = options.familyAccess;
  }

  const db = getDb();
  await db
    .update(memories)
    .set({
      sharedWithFamily: options.sharedWithFamily,
      familyAccess,
      updatedAt: new Date(),
    })
    .where(and(eq(memories.id, memory.id), eq(memories.userId, userId)));

  const updated = await getMemoryWithMedia(memoryId, userId);
  if (!updated) {
    throw new MemoryError("Failed to load memory after sharing update.");
  }
  return updated;
}

/**
 * Optional: set / clear cover. Cover must be clean + ready and already linked
 * (or owned clean media — will link if missing).
 */
export async function setMemoryCover(
  memoryId: string,
  userId: string,
  coverMediaId: string | null,
): Promise<MemoryWithMedia> {
  const memory = await getOwnedMemory(memoryId, userId);

  if (coverMediaId === null) {
    await getDb()
      .update(memories)
      .set({ coverMediaId: null, updatedAt: new Date() })
      .where(and(eq(memories.id, memory.id), eq(memories.userId, userId)));
    const cleared = await getMemoryWithMedia(memoryId, userId);
    if (!cleared) {
      throw new MemoryError("Failed to load memory after clearing cover.");
    }
    return cleared;
  }

  const [cover] = await loadCleanOwnedMedia(userId, [coverMediaId]);
  if (!cover) {
    throw new MemoryError(
      "Cover media must belong to you and be clean / ready.",
    );
  }

  await addMediaToMemory(memoryId, [coverMediaId], {
    userId,
  });

  await getDb()
    .update(memories)
    .set({ coverMediaId, updatedAt: new Date() })
    .where(and(eq(memories.id, memory.id), eq(memories.userId, userId)));

  const updated = await getMemoryWithMedia(memoryId, userId);
  if (!updated) {
    throw new MemoryError("Failed to load memory after setting cover.");
  }
  return updated;
}

/**
 * Delete a memory/album the user owns.
 *
 * - Removes the memory row (cascades `memory_media` joins)
 * - Deletes generated movies for this memory (DB + R2 outputs) first so
 *   orphaned movie files are not left behind when the FK cascades
 * - Does NOT delete underlying media library files
 */
export async function deleteMemory(
  memoryId: string,
  userId: string,
): Promise<{ id: string; title: string; deletedMovieCount: number }> {
  if (!memoryId?.trim() || !userId?.trim()) {
    throw new MemoryError("Memory id and user id are required.", {
      code: "validation",
    });
  }

  const memory = await getOwnedMemory(memoryId, userId);

  // Clean movie outputs before the memory cascade removes movie rows.
  const { listUserMovies, deleteMovie } = await import(
    "@/lib/movies/lifecycle"
  );
  let deletedMovieCount = 0;
  for (;;) {
    const batch = await listUserMovies(userId, {
      memoryId: memory.id,
      limit: 100,
    });
    if (batch.length === 0) break;
    for (const movie of batch) {
      await deleteMovie(movie.id, userId);
      deletedMovieCount += 1;
    }
  }

  const db = getDb();
  await db
    .delete(memories)
    .where(and(eq(memories.id, memory.id), eq(memories.userId, userId)));

  return {
    id: memory.id,
    title: memory.title,
    deletedMovieCount,
  };
}

/** Documented safety contract for memory media reads. */
export const MEMORY_CLEAN_MEDIA_NOTE =
  "Memory media queries always require moderation_status=clean and status=ready.";

/* -------------------------------------------------------------------------- */
/* JSON serialization (API responses)                                         */
/* -------------------------------------------------------------------------- */

export type SerializedSafeMedia = Omit<SafeMediaItem, "createdAt"> & {
  createdAt: string;
};

export type SerializedMemoryMediaItem = Omit<
  MemoryMediaItem,
  "createdAt" | "addedAt"
> & {
  createdAt: string;
  addedAt: string;
};

export type SerializedMemoryWithMedia = Omit<
  MemoryWithMedia,
  "createdAt" | "updatedAt" | "cover" | "media"
> & {
  createdAt: string;
  updatedAt: string;
  cover: SerializedSafeMedia | null;
  media: SerializedMemoryMediaItem[];
};

export type SerializedMemoryListItem = Omit<
  MemoryListItem,
  "createdAt" | "updatedAt" | "cover"
> & {
  createdAt: string;
  updatedAt: string;
  cover: SerializedSafeMedia | null;
};

function serializeSafeMedia(
  item: SafeMediaItem,
): SerializedSafeMedia {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
  };
}

export function serializeSafeMediaItem(
  item: SafeMediaItem,
): SerializedSafeMedia {
  return serializeSafeMedia(item);
}

export function serializeMemoryWithMedia(
  memory: MemoryWithMedia,
): SerializedMemoryWithMedia {
  const familyAccess: MemoryFamilyAccess =
    memory.familyAccess === "contribute" ? "contribute" : "view";
  return {
    id: memory.id,
    userId: memory.userId,
    type: memory.type === "story" ? "story" : "album",
    title: memory.title,
    description: memory.description ?? null,
    coverMediaId: memory.coverMediaId ?? null,
    settings: memory.settings ?? {},
    sharedWithFamily: Boolean(memory.sharedWithFamily),
    familyAccess,
    createdAt:
      memory.createdAt instanceof Date
        ? memory.createdAt.toISOString()
        : String(memory.createdAt),
    updatedAt:
      memory.updatedAt instanceof Date
        ? memory.updatedAt.toISOString()
        : String(memory.updatedAt),
    cover: memory.cover ? serializeSafeMedia(memory.cover) : null,
    media: memory.media.map((item) => ({
      ...item,
      createdAt:
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : String(item.createdAt),
      addedAt:
        item.addedAt instanceof Date
          ? item.addedAt.toISOString()
          : String(item.addedAt),
    })),
  };
}

export function serializeMemoryListItem(
  item: MemoryListItem,
): SerializedMemoryListItem {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    cover: item.cover ? serializeSafeMedia(item.cover) : null,
  };
}
