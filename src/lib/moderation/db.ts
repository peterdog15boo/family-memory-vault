import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { media, moderationEvents, type Media } from "@/lib/db/schema";
import type {
  ModerationResult,
  ModerationStatus,
} from "@/lib/moderation/types";

/** Re-export quarantine entry point (R2 move + DB + audit). */
export { markAsQuarantined } from "@/lib/moderation/quarantine";

function lifecycleStatusForModeration(
  status: ModerationStatus,
): Media["status"] | undefined {
  switch (status) {
    case "clean":
      return "ready";
    case "csam_quarantined":
      return "csam_quarantined";
    case "rejected":
      return "rejected";
    case "adult":
      // Keep out of family library; lifecycle stays non-ready.
      return "rejected";
    case "pending":
    case "needs_human_review":
      // Hold in the moderation queue / review lane — never ready.
      return "pending_moderation";
    default:
      return undefined;
  }
}

/**
 * Persist a moderation decision onto the media row and append an audit event.
 * When status is "clean", also sets lifecycle status to "ready".
 * When status is "csam_quarantined" / "rejected", updates lifecycle accordingly.
 */
export async function updateMediaModerationStatus(
  mediaId: string,
  status: ModerationStatus,
  result?: ModerationResult,
): Promise<Media> {
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

  const nextLifecycle = lifecycleStatusForModeration(status);
  const photodnaMatch = result?.photodnaMatch ?? existing.photodnaMatch;

  const [updated] = await db
    .update(media)
    .set({
      moderationStatus: status,
      ...(nextLifecycle ? { status: nextLifecycle } : {}),
      ...(result?.labels !== undefined
        ? { moderationLabels: result.labels ?? null }
        : {}),
      ...(result?.aiCsamScore !== undefined
        ? { aiCsamScore: result.aiCsamScore }
        : {}),
      ...(result?.aiNudityScore !== undefined
        ? { aiNudityScore: result.aiNudityScore }
        : {}),
      photodnaMatch,
      ...(status === "csam_quarantined" && !existing.quarantinedAt
        ? { quarantinedAt: now }
        : {}),
      updatedAt: now,
    })
    .where(eq(media.id, mediaId))
    .returning();

  await db.insert(moderationEvents).values({
    id: nanoid(),
    mediaId,
    eventType: "moderation.status_updated",
    source: result?.provider ?? "moderation.db",
    previousStatus: existing.status,
    newStatus: updated.status,
    previousModerationStatus: existing.moderationStatus,
    newModerationStatus: status,
    labels: result?.labels ?? existing.moderationLabels,
    aiCsamScore: result?.aiCsamScore ?? existing.aiCsamScore,
    aiNudityScore: result?.aiNudityScore ?? existing.aiNudityScore,
    photodnaMatch,
    notes: result?.notes,
    metadata: result?.raw
      ? { raw: result.raw, provider: result.provider }
      : result?.provider
        ? { provider: result.provider }
        : null,
    createdAt: now,
  });

  // Drop face embeddings when media leaves the family-safe set.
  if (status !== "clean" && existing.moderationStatus === "clean") {
    try {
      const { deleteFacesForMedia } = await import("@/lib/people");
      const removed = await deleteFacesForMedia(mediaId, existing.userId);
      if (removed > 0) {
        console.info("[moderation.db] Removed faces after leaving clean", {
          mediaId,
          removed,
          newStatus: status,
        });
      }
    } catch (error) {
      console.error("[moderation.db] Failed to remove faces after unclean", {
        mediaId,
        error,
      });
    }
  }

  // Auto-attach to a memory after first clean+ready (owner-only; never bypasses gate).
  if (
    status === "clean" &&
    nextLifecycle === "ready" &&
    existing.pendingMemoryId
  ) {
    const memoryId = existing.pendingMemoryId;
    try {
      const { addMediaToMemory } = await import("@/lib/memories");
      await addMediaToMemory(memoryId, [mediaId], {
        userId: existing.userId,
      });
      await db
        .update(media)
        .set({ pendingMemoryId: null, updatedAt: new Date() })
        .where(eq(media.id, mediaId));
      console.info("[moderation.db] Auto-attached media to memory", {
        mediaId,
        memoryId,
      });
    } catch (error) {
      console.error("[moderation.db] Failed to auto-attach to memory", {
        mediaId,
        memoryId,
        error,
      });
      // Clear pending so we do not retry forever on permanent failures.
      try {
        await db
          .update(media)
          .set({ pendingMemoryId: null, updatedAt: new Date() })
          .where(eq(media.id, mediaId));
      } catch {
        // ignore
      }
    }
  }

  return updated;
}

/**
 * Persist an NCMEC CyberTipline report id after a successful (or attempted) filing.
 */
export async function saveNcmecReportId(
  mediaId: string,
  reportId: string,
): Promise<Media> {
  if (!reportId.trim()) {
    throw new Error("NCMEC report id must be a non-empty string.");
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

  const [updated] = await db
    .update(media)
    .set({
      ncmecReportId: reportId,
      ncmecReportedAt: now,
      updatedAt: now,
    })
    .where(eq(media.id, mediaId))
    .returning();

  await db.insert(moderationEvents).values({
    id: nanoid(),
    mediaId,
    eventType: "moderation.ncmec_reported",
    source: "ncmec.cybertipline",
    previousStatus: existing.status,
    newStatus: updated.status,
    previousModerationStatus: existing.moderationStatus,
    newModerationStatus: updated.moderationStatus,
    notes: `NCMEC CyberTipline report id saved.`,
    metadata: {
      ncmecReportId: reportId,
      // Do not attach binary content or illegal imagery to audit metadata.
    },
    createdAt: now,
  });

  return updated;
}
