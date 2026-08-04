/**
 * Digital Legacy videos — owner-scoped CRUD.
 *
 * Invariants:
 * - Every query filters by userId.
 * - Multiple videos per section (ordered by sort_order).
 * - Storage under private-legacy-videos/ only — never family gallery media.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  LEGACY_INSTRUCTION_SECTION_TYPES,
  LEGACY_VIDEO_SECTION_TYPES,
  LEGACY_VIDEO_SOURCE_TYPES,
  legacyInstructions,
  legacyVideos,
  type LegacyVideo,
} from "@/lib/db/schema";
import { LegacyError } from "@/lib/legacy/errors";
import type {
  CreateLegacyVideoInput,
  LegacyVideoSectionType,
  LegacyVideoSourceType,
  UpdateLegacyVideoInput,
} from "@/lib/legacy/types";
import {
  assertAllowedLegacyVideoUpload,
  assertOwnedLegacyVideoStorageKey,
  deleteLegacyVideoObjects,
} from "@/lib/legacy/video-storage";

const VIDEO_SECTION_SET = new Set<string>(LEGACY_VIDEO_SECTION_TYPES);
const VIDEO_SOURCE_SET = new Set<string>(LEGACY_VIDEO_SOURCE_TYPES);
const INSTRUCTION_SECTION_SET = new Set<string>(
  LEGACY_INSTRUCTION_SECTION_TYPES,
);

function assertUserId(userId: string): void {
  if (!userId?.trim()) {
    throw new LegacyError("userId is required.", { code: "validation" });
  }
}

function cleanOptionalText(
  value: string | null | undefined,
  max: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function assertVideoSectionType(
  sectionType: string,
): asserts sectionType is LegacyVideoSectionType {
  if (!VIDEO_SECTION_SET.has(sectionType)) {
    throw new LegacyError(`Invalid video section: ${sectionType}`, {
      code: "validation",
    });
  }
}

function assertVideoSourceType(
  sourceType: string,
): asserts sourceType is LegacyVideoSourceType {
  if (!VIDEO_SOURCE_SET.has(sourceType)) {
    throw new LegacyError(`Invalid video source type: ${sourceType}`, {
      code: "validation",
    });
  }
}

/**
 * Resolve / validate an optional instruction link.
 * - `undefined` input → leave unchanged (returns `undefined`)
 * - `null` / blank → clear link (returns `null`)
 * - id → must be owned; section must match when video section is an instruction section
 */
async function resolveInstructionLink(input: {
  userId: string;
  legacyInstructionId: string | null | undefined;
  sectionType: LegacyVideoSectionType;
}): Promise<string | null | undefined> {
  if (input.legacyInstructionId === undefined) return undefined;
  if (input.legacyInstructionId === null || !input.legacyInstructionId.trim()) {
    return null;
  }

  const instructionId = input.legacyInstructionId.trim();
  const db = getDb();
  const [row] = await db
    .select({
      id: legacyInstructions.id,
      sectionType: legacyInstructions.sectionType,
    })
    .from(legacyInstructions)
    .where(
      and(
        eq(legacyInstructions.id, instructionId),
        eq(legacyInstructions.userId, input.userId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new LegacyError(
      "Linked instruction must be one of your Digital Legacy instructions.",
      { code: "validation" },
    );
  }

  if (
    INSTRUCTION_SECTION_SET.has(input.sectionType) &&
    row.sectionType !== input.sectionType
  ) {
    throw new LegacyError(
      "Video section_type must match the linked instruction section.",
      { code: "validation" },
    );
  }

  return row.id;
}

function assertPositiveInt(
  value: number,
  field: string,
  max?: number,
): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new LegacyError(`${field} must be a non-negative integer.`, {
      code: "validation",
    });
  }
  if (max !== undefined && value > max) {
    throw new LegacyError(`${field} is too large.`, { code: "validation" });
  }
  return value;
}

export async function listLegacyVideosBySection(
  userId: string,
  sectionType: LegacyVideoSectionType,
): Promise<LegacyVideo[]> {
  assertUserId(userId);
  assertVideoSectionType(sectionType);
  const db = getDb();
  return db
    .select()
    .from(legacyVideos)
    .where(
      and(
        eq(legacyVideos.userId, userId),
        eq(legacyVideos.sectionType, sectionType),
      ),
    )
    .orderBy(
      desc(legacyVideos.isPrimary),
      asc(legacyVideos.sortOrder),
      asc(legacyVideos.createdAt),
    );
}

export async function listLegacyVideos(
  userId: string,
): Promise<LegacyVideo[]> {
  assertUserId(userId);
  const db = getDb();
  return db
    .select()
    .from(legacyVideos)
    .where(eq(legacyVideos.userId, userId))
    .orderBy(
      asc(legacyVideos.sectionType),
      desc(legacyVideos.isPrimary),
      asc(legacyVideos.sortOrder),
      asc(legacyVideos.createdAt),
    );
}

export async function getLegacyVideoForUser(
  videoId: string,
  userId: string,
): Promise<LegacyVideo | null> {
  assertUserId(userId);
  if (!videoId?.trim()) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(legacyVideos)
    .where(and(eq(legacyVideos.id, videoId), eq(legacyVideos.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createLegacyVideo(
  input: CreateLegacyVideoInput,
): Promise<LegacyVideo> {
  assertUserId(input.userId);
  assertVideoSectionType(input.sectionType);
  const sourceType = input.sourceType ?? "uploaded";
  assertVideoSourceType(sourceType);

  const title = input.title.trim();
  if (!title) {
    throw new LegacyError("Video title is required.", { code: "validation" });
  }

  const contentType = assertAllowedLegacyVideoUpload({
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });
  assertOwnedLegacyVideoStorageKey(input.storageKey, input.userId);
  if (input.thumbnailKey) {
    assertOwnedLegacyVideoStorageKey(input.thumbnailKey, input.userId);
  }

  const legacyInstructionId =
    (await resolveInstructionLink({
      userId: input.userId,
      legacyInstructionId: input.legacyInstructionId ?? null,
      sectionType: input.sectionType,
    })) ?? null;

  const durationSeconds =
    input.durationSeconds === undefined || input.durationSeconds === null
      ? null
      : assertPositiveInt(input.durationSeconds, "durationSeconds", 86_400);

  const sortOrder =
    input.sortOrder === undefined
      ? 0
      : assertPositiveInt(input.sortOrder, "sortOrder", 100_000);

  const existingInSection = await listLegacyVideosBySection(
    input.userId,
    input.sectionType,
  );
  const wantsPrimary =
    input.isPrimary === true ||
    (input.isPrimary !== false && existingInSection.length === 0);
  if (wantsPrimary) {
    await clearSectionPrimary(input.userId, input.sectionType);
  }

  const db = getDb();
  const now = new Date();
  const id = input.id?.trim() || nanoid();
  const [row] = await db
    .insert(legacyVideos)
    .values({
      id,
      userId: input.userId,
      sectionType: input.sectionType,
      legacyInstructionId,
      title: title.slice(0, 200),
      description: cleanOptionalText(input.description, 4000) ?? null,
      storageKey: input.storageKey,
      thumbnailKey: input.thumbnailKey?.trim() || null,
      durationSeconds,
      contentType,
      sizeBytes: assertPositiveInt(input.sizeBytes, "sizeBytes"),
      sourceType,
      isPrimary: wantsPrimary,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new LegacyError("Failed to create legacy video.");
  return row;
}

export async function updateLegacyVideo(
  videoId: string,
  userId: string,
  patch: UpdateLegacyVideoInput,
): Promise<LegacyVideo> {
  const existing = await getLegacyVideoForUser(videoId, userId);
  if (!existing) {
    throw new LegacyError("Legacy video not found.", { code: "not_found" });
  }

  if (patch.sectionType !== undefined) {
    assertVideoSectionType(patch.sectionType);
  }
  if (patch.sourceType !== undefined) {
    assertVideoSourceType(patch.sourceType);
  }

  const nextTitle = patch.title?.trim();
  if (nextTitle !== undefined && !nextTitle) {
    throw new LegacyError("Video title cannot be empty.", {
      code: "validation",
    });
  }

  const nextSection = patch.sectionType ?? existing.sectionType;

  let nextInstructionId: string | null | undefined =
    patch.legacyInstructionId === undefined
      ? undefined
      : await resolveInstructionLink({
          userId,
          legacyInstructionId: patch.legacyInstructionId,
          sectionType: nextSection,
        });

  // If section changes and instruction was not patched, re-validate existing link.
  if (
    patch.sectionType !== undefined &&
    patch.legacyInstructionId === undefined &&
    existing.legacyInstructionId
  ) {
    nextInstructionId = await resolveInstructionLink({
      userId,
      legacyInstructionId: existing.legacyInstructionId,
      sectionType: nextSection,
    });
  }

  let nextContentType = existing.contentType;
  let nextSizeBytes = existing.sizeBytes;
  let nextStorageKey = existing.storageKey;

  if (patch.storageKey !== undefined) {
    assertOwnedLegacyVideoStorageKey(patch.storageKey, userId);
    nextStorageKey = patch.storageKey;
    if (patch.contentType === undefined || patch.sizeBytes === undefined) {
      throw new LegacyError(
        "contentType and sizeBytes are required when replacing storageKey.",
        { code: "validation" },
      );
    }
    nextContentType = assertAllowedLegacyVideoUpload({
      contentType: patch.contentType,
      sizeBytes: patch.sizeBytes,
    });
    nextSizeBytes = assertPositiveInt(patch.sizeBytes, "sizeBytes");
  } else if (patch.contentType !== undefined || patch.sizeBytes !== undefined) {
    nextContentType = assertAllowedLegacyVideoUpload({
      contentType: patch.contentType ?? existing.contentType,
      sizeBytes: patch.sizeBytes ?? existing.sizeBytes,
    });
    if (patch.sizeBytes !== undefined) {
      nextSizeBytes = assertPositiveInt(patch.sizeBytes, "sizeBytes");
    }
  }

  if (patch.thumbnailKey) {
    assertOwnedLegacyVideoStorageKey(patch.thumbnailKey, userId);
  }

  const durationSeconds =
    patch.durationSeconds === undefined
      ? undefined
      : patch.durationSeconds === null
        ? null
        : assertPositiveInt(patch.durationSeconds, "durationSeconds", 86_400);

  const sortOrder =
    patch.sortOrder === undefined
      ? undefined
      : assertPositiveInt(patch.sortOrder, "sortOrder", 100_000);

  const previousStorageKey = existing.storageKey;
  const previousThumbnailKey = existing.thumbnailKey;

  const db = getDb();
  const [row] = await db
    .update(legacyVideos)
    .set({
      ...(patch.sectionType !== undefined
        ? { sectionType: patch.sectionType }
        : {}),
      ...(nextInstructionId !== undefined
        ? { legacyInstructionId: nextInstructionId }
        : {}),
      ...(nextTitle !== undefined ? { title: nextTitle.slice(0, 200) } : {}),
      ...(patch.description !== undefined
        ? { description: cleanOptionalText(patch.description, 4000) ?? null }
        : {}),
      ...(patch.storageKey !== undefined
        ? {
            storageKey: nextStorageKey,
            contentType: nextContentType,
            sizeBytes: nextSizeBytes,
          }
        : patch.contentType !== undefined || patch.sizeBytes !== undefined
          ? { contentType: nextContentType, sizeBytes: nextSizeBytes }
          : {}),
      ...(patch.thumbnailKey !== undefined
        ? { thumbnailKey: patch.thumbnailKey?.trim() || null }
        : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(patch.sourceType !== undefined ? { sourceType: patch.sourceType } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(patch.isPrimary !== undefined
        ? { isPrimary: Boolean(patch.isPrimary) }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(legacyVideos.id, videoId), eq(legacyVideos.userId, userId)))
    .returning();

  if (!row) {
    throw new LegacyError("Legacy video not found.", { code: "not_found" });
  }

  if (patch.isPrimary === true) {
    await clearSectionPrimary(userId, row.sectionType, row.id);
  }

  const staleKeys: string[] = [];
  if (
    patch.storageKey !== undefined &&
    previousStorageKey &&
    previousStorageKey !== row.storageKey
  ) {
    staleKeys.push(previousStorageKey);
  }
  if (
    patch.thumbnailKey !== undefined &&
    previousThumbnailKey &&
    previousThumbnailKey !== row.thumbnailKey
  ) {
    staleKeys.push(previousThumbnailKey);
  }
  if (staleKeys.length > 0) {
    await deleteLegacyVideoObjects({
      userId,
      videoId,
      storageKey: staleKeys[0],
      thumbnailKey: staleKeys[1] ?? null,
    });
  }

  return row;
}

/**
 * Feature one video as primary within its section (clears any other primary).
 */
export async function setLegacyVideoPrimary(
  videoId: string,
  userId: string,
  isPrimary = true,
): Promise<LegacyVideo> {
  return updateLegacyVideo(videoId, userId, { isPrimary });
}

async function clearSectionPrimary(
  userId: string,
  sectionType: LegacyVideoSectionType,
  exceptVideoId?: string,
): Promise<void> {
  const db = getDb();
  const conditions = [
    eq(legacyVideos.userId, userId),
    eq(legacyVideos.sectionType, sectionType),
    eq(legacyVideos.isPrimary, true),
  ];
  const rows = await db
    .select({ id: legacyVideos.id })
    .from(legacyVideos)
    .where(and(...conditions));

  const toClear = rows
    .map((row) => row.id)
    .filter((id) => id !== exceptVideoId);
  if (toClear.length === 0) return;

  const now = new Date();
  await Promise.all(
    toClear.map((id) =>
      db
        .update(legacyVideos)
        .set({ isPrimary: false, updatedAt: now })
        .where(and(eq(legacyVideos.id, id), eq(legacyVideos.userId, userId))),
    ),
  );
}

export async function deleteLegacyVideo(
  videoId: string,
  userId: string,
): Promise<void> {
  const existing = await getLegacyVideoForUser(videoId, userId);
  if (!existing) {
    throw new LegacyError("Legacy video not found.", { code: "not_found" });
  }

  const db = getDb();
  const deleted = await db
    .delete(legacyVideos)
    .where(and(eq(legacyVideos.id, videoId), eq(legacyVideos.userId, userId)))
    .returning({ id: legacyVideos.id });

  if (deleted.length === 0) {
    throw new LegacyError("Legacy video not found.", { code: "not_found" });
  }

  await deleteLegacyVideoObjects({
    userId,
    videoId,
    storageKey: existing.storageKey,
    thumbnailKey: existing.thumbnailKey,
  });

  if (existing.isPrimary) {
    const remaining = await listLegacyVideosBySection(
      userId,
      existing.sectionType,
    );
    const next = remaining[0];
    if (next) {
      await db
        .update(legacyVideos)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(
          and(eq(legacyVideos.id, next.id), eq(legacyVideos.userId, userId)),
        );
    }
  }
}

/**
 * Reorder videos within a section. `orderedIds` must be the full set of
 * video ids for that section (owner-scoped), in the desired order.
 */
export async function reorderLegacyVideos(
  userId: string,
  sectionType: LegacyVideoSectionType,
  orderedIds: string[],
): Promise<LegacyVideo[]> {
  assertUserId(userId);
  assertVideoSectionType(sectionType);

  const cleaned = [
    ...new Set(orderedIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (cleaned.length !== orderedIds.filter((id) => id?.trim()).length) {
    throw new LegacyError("orderedIds must not contain duplicates.", {
      code: "validation",
    });
  }

  const existing = await listLegacyVideosBySection(userId, sectionType);
  const existingIds = new Set(existing.map((row) => row.id));

  if (cleaned.length !== existing.length) {
    throw new LegacyError(
      "orderedIds must include every video in the section exactly once.",
      { code: "validation" },
    );
  }
  for (const id of cleaned) {
    if (!existingIds.has(id)) {
      throw new LegacyError(
        "orderedIds contains a video that is not in this section.",
        { code: "validation" },
      );
    }
  }

  const db = getDb();
  const now = new Date();
  await Promise.all(
    cleaned.map((id, index) =>
      db
        .update(legacyVideos)
        .set({ sortOrder: index, updatedAt: now })
        .where(
          and(
            eq(legacyVideos.id, id),
            eq(legacyVideos.userId, userId),
            eq(legacyVideos.sectionType, sectionType),
          ),
        ),
    ),
  );

  return listLegacyVideosBySection(userId, sectionType);
}

/** Convenience: videos grouped by section for vault loaders. */
export async function listLegacyVideosGroupedBySection(
  userId: string,
): Promise<Record<LegacyVideoSectionType, LegacyVideo[]>> {
  const rows = await listLegacyVideos(userId);
  const out = Object.fromEntries(
    LEGACY_VIDEO_SECTION_TYPES.map((section) => [section, [] as LegacyVideo[]]),
  ) as Record<LegacyVideoSectionType, LegacyVideo[]>;

  for (const row of rows) {
    out[row.sectionType].push(row);
  }
  return out;
}
