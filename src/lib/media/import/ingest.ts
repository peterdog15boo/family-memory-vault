/**
 * Shared server-side finalize path for device uploads and cloud imports.
 * Always lands in pending_moderation — never clean/ready here.
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import { getDb } from "@/lib/db";
import { media, moderationEvents, memories } from "@/lib/db/schema";
import { enqueueModerationJob } from "@/lib/queue";
import {
  headObjectMeta,
  isTempKey,
  promoteTempToOriginals,
  tempKeyToOriginalsKey,
} from "@/lib/r2";
import {
  maxBytesForContentType,
  mediaTypeFromContentType,
} from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";
import type { MediaImportProvider } from "@/lib/media/import/types";

export type FinalizeUploadedMediaInput = {
  userId: string;
  key: string;
  filename: string;
  contentType: string;
  declaredSize?: number;
  /** When set, media auto-links to this memory after clean/ready. */
  attachMemoryId?: string | null;
  importProvider?: MediaImportProvider | null;
  importExternalId?: string | null;
  source?: string;
};

export type FinalizeUploadedMediaResult = {
  mediaId: string;
  jobId: string | null;
  status: string;
  moderationStatus: string;
  deduped: boolean;
  pendingMemoryId: string | null;
};

async function assertOwnedMemory(
  memoryId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(eq(memories.id, memoryId), eq(memories.userId, userId)))
    .limit(1);
  if (!row) {
    throw new Error("Memory not found or not owned by this user.");
  }
}

/**
 * Promote a temp/ object into media + enqueue moderation.
 * Dedupes by (userId, importProvider, importExternalId) when provided.
 */
export async function finalizeUploadedMedia(
  input: FinalizeUploadedMediaInput,
): Promise<FinalizeUploadedMediaResult> {
  const {
    userId,
    key,
    filename,
    contentType,
    declaredSize = 0,
    attachMemoryId = null,
    importProvider = null,
    importExternalId = null,
    source = "media.ingest",
  } = input;

  if (!isTempKey(key)) {
    throw new Error("Upload key must use the temp/ prefix.");
  }

  const expectedPrefix = `temp/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new Error("Upload key does not belong to the authenticated user.");
  }

  if (attachMemoryId) {
    await assertOwnedMemory(attachMemoryId, userId);
  }

  const db = getDb();

  if (importProvider && importExternalId) {
    const [existing] = await db
      .select()
      .from(media)
      .where(
        and(
          eq(media.userId, userId),
          eq(media.importProvider, importProvider),
          eq(media.importExternalId, importExternalId),
        ),
      )
      .limit(1);

    if (existing) {
      if (
        attachMemoryId &&
        !existing.pendingMemoryId &&
        existing.moderationStatus === "clean" &&
        existing.status === "ready"
      ) {
        const { addMediaToMemory } = await import("@/lib/memories");
        await addMediaToMemory(attachMemoryId, [existing.id], { userId });
      } else if (
        attachMemoryId &&
        existing.pendingMemoryId !== attachMemoryId &&
        !(
          existing.moderationStatus === "clean" && existing.status === "ready"
        )
      ) {
        await db
          .update(media)
          .set({
            pendingMemoryId: attachMemoryId,
            updatedAt: new Date(),
          })
          .where(eq(media.id, existing.id));
      }

      return {
        mediaId: existing.id,
        jobId: null,
        status: existing.status,
        moderationStatus: existing.moderationStatus,
        deduped: true,
        pendingMemoryId: attachMemoryId ?? existing.pendingMemoryId,
      };
    }
  }

  const head = await headObjectMeta(key);
  if (!head) {
    throw new Error(
      "Uploaded object was not found in storage. Try uploading again.",
    );
  }

  const byteSize = head.contentLength;
  if (byteSize <= 0) {
    throw new Error("Uploaded object is empty. Try uploading again.");
  }

  const maxBytes = maxBytesForContentType(contentType);
  if (byteSize > maxBytes) {
    const err = new Error(
      `File is too large. Max size is ${Math.round(maxBytes / (1024 * 1024))} MB for this type.`,
    );
    (err as Error & { code?: string }).code = "file_too_large";
    throw err;
  }

  await assertUploadWithinStorageQuota(userId, byteSize);
  await ensureAppUser(userId);

  const mediaId = nanoid();
  const originalsKey = tempKeyToOriginalsKey(key);
  const moved = await promoteTempToOriginals(key, originalsKey);
  const now = new Date();
  const mediaKind = mediaTypeFromContentType(contentType);

  const [row] = await db
    .insert(media)
    .values({
      id: mediaId,
      userId,
      type: mediaKind,
      contentType,
      byteSize,
      originalFilename: filename,
      originalKey: moved.toKey,
      status: "pending_moderation",
      moderationStatus: "pending",
      photodnaMatch: false,
      importProvider: importProvider ?? null,
      importExternalId: importExternalId ?? null,
      importedAt: importProvider ? now : null,
      pendingMemoryId: attachMemoryId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to insert media row after upload.");
  }

  await db.insert(moderationEvents).values({
    id: nanoid(),
    mediaId,
    eventType: "upload.received",
    source,
    previousStatus: null,
    newStatus: "pending_moderation",
    previousModerationStatus: null,
    newModerationStatus: "pending",
    actorId: userId,
    notes:
      "Upload recorded. Queued for moderation. Not ready for family library.",
    metadata: {
      tempKey: key,
      originalKey: moved.toKey,
      declaredSize,
      byteSize,
      contentType,
      originalFilename: filename,
      importProvider: importProvider ?? null,
      importExternalId: importExternalId ?? null,
      pendingMemoryId: attachMemoryId ?? null,
      r2ContentType: head.contentType ?? null,
    },
    createdAt: now,
  });

  const job = await enqueueModerationJob({
    mediaId,
    originalKey: moved.toKey,
    contentType,
    userId,
    extra: {
      source,
      filename,
      importProvider: importProvider ?? null,
    },
  });

  const { queueStorageThresholdCheck } = await import("@/lib/email/lifecycle");
  queueStorageThresholdCheck(userId);

  return {
    mediaId: row.id,
    jobId: job.id,
    status: row.status,
    moderationStatus: row.moderationStatus,
    deduped: false,
    pendingMemoryId: row.pendingMemoryId,
  };
}

export { StorageQuotaError };
