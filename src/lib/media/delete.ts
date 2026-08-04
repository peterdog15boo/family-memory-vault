import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import { MediaError } from "@/lib/media/errors";
import { logger } from "@/lib/observability/logger";
import { isQuarantineKey } from "@/lib/r2";

/**
 * Keys we may attempt to remove from R2 for a media row.
 * Quarantine evidence is never included (deleteObject also refuses it).
 */
export function collectDeletableMediaKeys(row: {
  originalKey: string;
  processedKey?: string | null;
  thumbnailKey?: string | null;
}): string[] {
  const keys = [row.originalKey, row.processedKey, row.thumbnailKey]
    .filter((key): key is string => Boolean(key?.trim()))
    .filter((key) => !isQuarantineKey(key));

  return [...new Set(keys)];
}

function isQuarantinedRow(row: Pick<Media, "status" | "moderationStatus">): boolean {
  return (
    row.status === "csam_quarantined" ||
    row.moderationStatus === "csam_quarantined"
  );
}

/**
 * Hard-delete media owned by the signed-in user (DB row + non-quarantine R2 objects).
 *
 * Owner-only. Refuses CSAM-quarantined rows so evidence stays intact.
 * Related faces / memory links cascade via FK; cover media is set null.
 */
export async function deleteMediaOwnedByUser(
  mediaId: string,
  userId: string,
): Promise<Media> {
  if (!mediaId?.trim() || !userId?.trim()) {
    throw new MediaError("mediaId and userId are required.", {
      code: "validation",
    });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new MediaError("Photo not found.", { code: "not_found" });
  }

  if (isQuarantinedRow(existing)) {
    throw new MediaError(
      "This item cannot be deleted from Photos. Contact support if you need help.",
      { code: "forbidden" },
    );
  }

  const { deleteObject } = await import("@/lib/r2");
  const keys = collectDeletableMediaKeys(existing);
  let deletedObjectCount = 0;

  for (const key of keys) {
    try {
      await deleteObject(key);
      deletedObjectCount += 1;
    } catch (error) {
      logger.warn("media.r2_delete_failed", {
        mediaId,
        userId,
        keyPrefix: key.split("/").slice(0, 2).join("/"),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const [deleted] = await db
    .delete(media)
    .where(and(eq(media.id, mediaId), eq(media.userId, userId)))
    .returning();

  if (!deleted) {
    throw new MediaError("Photo not found.", { code: "not_found" });
  }

  logger.info("media.deleted", {
    mediaId,
    userId,
    type: deleted.type,
    deletedObjectCount,
  });

  return deleted;
}
