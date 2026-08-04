/**
 * CSAM quarantine handling.
 *
 * When CSAM is detected:
 * 1. Relocate the R2 object from temp/ or originals/ → quarantine/
 * 2. Ensure no signed URLs can be issued for it (R2 helpers refuse quarantine/)
 * 3. Update the media row: moderation_status = csam_quarantined, quarantined_at
 * 4. Append a moderation_events audit row (log the action)
 * 5. Never delete the quarantined file automatically — evidence is preserved
 *
 * Admin review: use listQuarantinedItemsForAdmin() later; it returns metadata
 * only and never generates download URLs.
 */

import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { assertAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { media, moderationEvents, type Media } from "@/lib/db/schema";
import {
  isQuarantineKey,
  quarantineObject,
  type MoveObjectResult,
} from "@/lib/r2";
import type { ModerationResult } from "@/lib/moderation/types";

export type QuarantineMediaResult = {
  media: Media;
  /** R2 relocate result for the primary (original) object, if attempted. */
  objectMove?: MoveObjectResult;
  /** Optional relocate attempts for derivatives (thumbnail / processed). */
  derivativeMoves: MoveObjectResult[];
  /** True when R2 relocate failed but the DB row was still quarantined. */
  storageMoveFailed: boolean;
};

export type QuarantinedItemSummary = {
  id: string;
  userId: string;
  type: Media["type"];
  contentType: string;
  originalFilename: string | null;
  /** Quarantine (or last known) object key — never signed for download here. */
  originalKey: string;
  moderationStatus: Media["moderationStatus"];
  status: Media["status"];
  photodnaMatch: boolean;
  aiCsamScore: number | null;
  aiNudityScore: number | null;
  quarantinedAt: Date | null;
  ncmecReportId: string | null;
  ncmecReportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** @deprecated Prefer assertAdminUser from @/lib/auth/admin */
export { assertAdminUser as assertAdminCaller } from "@/lib/auth/admin";

async function relocateKeyIfNeeded(
  key: string | null | undefined,
  label: string,
  mediaId: string,
): Promise<MoveObjectResult | undefined> {
  if (!key) return undefined;
  if (isQuarantineKey(key)) {
    return { fromKey: key, toKey: key };
  }

  try {
    const moved = await quarantineObject(key);
    console.info("[moderation.quarantine] Relocated R2 object", {
      mediaId,
      label,
      fromKey: moved.fromKey,
      toKey: moved.toKey,
    });
    return moved;
  } catch (error) {
    console.error("[moderation.quarantine] R2 relocate failed", {
      mediaId,
      label,
      key,
      error,
    });
    throw error;
  }
}

/**
 * Quarantine a media row after CSAM detection.
 *
 * Moves the object under quarantine/, updates moderation_status /
 * quarantined_at, and logs an audit event. Does not delete evidence.
 */
export async function quarantineMedia(
  mediaId: string,
  reason: string,
  result?: ModerationResult,
  options?: { actorUserId?: string },
): Promise<QuarantineMediaResult> {
  if (!mediaId?.trim()) {
    throw new Error("quarantineMedia requires a mediaId.");
  }
  if (!reason?.trim()) {
    throw new Error("quarantineMedia requires a reason.");
  }

  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!existing) {
    throw new Error(`Media not found: ${mediaId}`);
  }

  console.info("[moderation.quarantine] Quarantine started", {
    mediaId,
    previousModerationStatus: existing.moderationStatus,
    previousKey: existing.originalKey,
    reason,
  });

  let objectMove: MoveObjectResult | undefined;
  const derivativeMoves: MoveObjectResult[] = [];
  let storageMoveFailed = false;
  let quarantineKey = existing.originalKey;

  try {
    objectMove = await relocateKeyIfNeeded(
      existing.originalKey,
      "original",
      mediaId,
    );
    if (objectMove) {
      quarantineKey = objectMove.toKey;
    }
  } catch (error) {
    // Still mark quarantined in DB so family surfaces refuse the item.
    storageMoveFailed = true;
    console.error(
      "[moderation.quarantine] Continuing with DB quarantine after storage failure",
      { mediaId, error },
    );
    try {
      const { logQuarantineFailed } = await import(
        "@/lib/observability/events"
      );
      logQuarantineFailed(
        { mediaId, stage: "r2_relocate", continuing: true },
        error,
      );
    } catch {
      // observability must never break quarantine
    }
  }

  // Best-effort: relocate derivatives so they are also unsigned / inaccessible.
  // Failures here do not block the primary quarantine decision.
  for (const [label, key] of [
    ["thumbnail", existing.thumbnailKey],
    ["processed", existing.processedKey],
  ] as const) {
    if (!key || isQuarantineKey(key)) continue;
    try {
      const moved = await relocateKeyIfNeeded(key, label, mediaId);
      if (moved) derivativeMoves.push(moved);
    } catch (error) {
      console.error("[moderation.quarantine] Derivative relocate failed", {
        mediaId,
        label,
        key,
        error,
      });
    }
  }

  const thumbnailKey =
    derivativeMoves.find((m) => m.fromKey === existing.thumbnailKey)?.toKey ??
    existing.thumbnailKey;
  const processedKey =
    derivativeMoves.find((m) => m.fromKey === existing.processedKey)?.toKey ??
    existing.processedKey;

  const merged: ModerationResult = {
    photodnaMatch: result?.photodnaMatch ?? existing.photodnaMatch ?? true,
    aiCsamScore: result?.aiCsamScore ?? existing.aiCsamScore,
    aiNudityScore: result?.aiNudityScore ?? existing.aiNudityScore,
    labels: result?.labels ?? existing.moderationLabels,
    provider: result?.provider ?? "moderation.quarantine",
    raw: result?.raw,
    notes: result?.notes ? `${reason} | ${result.notes}` : reason,
  };

  const [updated] = await db
    .update(media)
    .set({
      originalKey: quarantineKey,
      thumbnailKey: thumbnailKey ?? null,
      processedKey: processedKey ?? null,
      status: "csam_quarantined",
      moderationStatus: "csam_quarantined",
      quarantinedAt: existing.quarantinedAt ?? now,
      photodnaMatch: merged.photodnaMatch,
      aiCsamScore: merged.aiCsamScore,
      aiNudityScore: merged.aiNudityScore,
      moderationLabels: merged.labels ?? null,
      updatedAt: now,
    })
    .where(eq(media.id, mediaId))
    .returning();

  await db.insert(moderationEvents).values({
    id: nanoid(),
    mediaId,
    eventType: "moderation.quarantined",
    source: merged.provider ?? "moderation.quarantine",
    previousStatus: existing.status,
    newStatus: "csam_quarantined",
    previousModerationStatus: existing.moderationStatus,
    newModerationStatus: "csam_quarantined",
    labels: merged.labels,
    aiCsamScore: merged.aiCsamScore,
    aiNudityScore: merged.aiNudityScore,
    photodnaMatch: merged.photodnaMatch,
    notes: merged.notes,
    metadata: {
      reason,
      previousKey: existing.originalKey,
      quarantineKey,
      storageMoveFailed,
      objectMove: objectMove
        ? { fromKey: objectMove.fromKey, toKey: objectMove.toKey }
        : null,
      derivativeMoves: derivativeMoves.map((m) => ({
        fromKey: m.fromKey,
        toKey: m.toKey,
      })),
      // Evidence is preserved under quarantine/ — never auto-deleted.
      evidencePreserved: true,
      ...(merged.raw ? { raw: merged.raw } : {}),
    },
    createdAt: now,
  });

  console.info("[moderation.quarantine] Quarantine completed", {
    mediaId,
    quarantineKey,
    quarantinedAt: updated.quarantinedAt?.toISOString() ?? null,
    storageMoveFailed,
    evidencePreserved: true,
  });

  try {
    const { logQuarantineCompleted } = await import(
      "@/lib/observability/events"
    );
    logQuarantineCompleted({
      mediaId,
      userId: updated.userId,
      storageMoveFailed,
      hasNcmecReportId: Boolean(updated.ncmecReportId),
    });
  } catch {
    // observability must never break quarantine
  }

  if (options?.actorUserId) {
    const { logAdminAudit } = await import("@/lib/admin/audit");
    await logAdminAudit({
      actorId: options.actorUserId,
      action: "moderation.quarantine",
      targetType: "media",
      targetId: mediaId,
      metadata: {
        reason,
        previousModerationStatus: existing.moderationStatus,
        quarantineKey,
        storageMoveFailed,
        manual: true,
      },
    });
  }

  // Faces must not remain associated with quarantined evidence.
  try {
    const { deleteFacesForMedia } = await import("@/lib/people");
    const removed = await deleteFacesForMedia(mediaId, existing.userId);
    if (removed > 0) {
      console.info("[moderation.quarantine] Removed faces for quarantined media", {
        mediaId,
        removed,
      });
    }
  } catch (error) {
    console.error("[moderation.quarantine] Failed to remove faces", {
      mediaId,
      error,
    });
  }

  return {
    media: updated,
    objectMove,
    derivativeMoves,
    storageMoveFailed,
  };
}

/**
 * Admin-only listing of quarantined media for later review.
 *
 * Returns metadata only — never generates signed download URLs.
 * Callers must pass the Clerk user id of the actor; access is gated by
 * admin helpers (`isAdmin` / `assertAdminUser`).
 */
export async function listQuarantinedItemsForAdmin(
  actorUserId: string,
  options?: {
    limit?: number;
  },
): Promise<QuarantinedItemSummary[]> {
  await assertAdminUser(actorUserId);

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const db = getDb();

  const rows = await db
    .select({
      id: media.id,
      userId: media.userId,
      type: media.type,
      contentType: media.contentType,
      originalFilename: media.originalFilename,
      originalKey: media.originalKey,
      moderationStatus: media.moderationStatus,
      status: media.status,
      photodnaMatch: media.photodnaMatch,
      aiCsamScore: media.aiCsamScore,
      aiNudityScore: media.aiNudityScore,
      quarantinedAt: media.quarantinedAt,
      ncmecReportId: media.ncmecReportId,
      ncmecReportedAt: media.ncmecReportedAt,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    })
    .from(media)
    .where(eq(media.moderationStatus, "csam_quarantined"))
    .orderBy(desc(media.quarantinedAt), desc(media.createdAt))
    .limit(limit);

  console.info("[moderation.quarantine] Admin listed quarantined items", {
    actorUserId,
    count: rows.length,
    limit,
  });

  return rows;
}

/** Alias used by the moderation pipeline / db helpers. */
export async function markAsQuarantined(
  mediaId: string,
  reason: string,
  result?: ModerationResult,
): Promise<Media> {
  const { media: row } = await quarantineMedia(mediaId, reason, result);
  return row;
}
