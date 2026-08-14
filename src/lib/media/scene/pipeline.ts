/**
 * Best-effort enqueue for scene analysis after media is clean/ready.
 *
 * Tagging never blocks upload/moderation — jobs run on the scene worker and
 * write ai_tags / ai_objects / ai_scenes (+ legacy scene_* columns).
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media, type ProcessingJob } from "@/lib/db/schema";
import {
  analyzeAndStoreSceneForMedia,
  hasSearchableVisualLabels,
  isEligibleSceneMedia,
  isSceneAnalysisEnabled,
} from "@/lib/media/scene/analyze";
import {
  enqueueSceneAnalysisJob,
  hasActiveSceneAnalysisJob,
} from "@/lib/queue";
import { cleanReadyMediaFilter } from "@/lib/media/queries";

const LOG = "[scene.pipeline]";

export type MaybeEnqueueSceneAnalysisOptions = {
  force?: boolean;
  source?: string;
  delayMs?: number;
};

/**
 * Enqueue scene analysis for a clean photo or video. Never throws.
 */
export async function maybeEnqueueSceneAnalysisForMedia(
  row: Pick<
    Media,
    | "id"
    | "userId"
    | "type"
    | "status"
    | "moderationStatus"
    | "contentType"
  > &
    Partial<
      Pick<
        Media,
        | "sceneAnalysisStatus"
        | "sceneAnalyzedAt"
        | "visualAnalyzedAt"
        | "aiTags"
        | "aiObjects"
        | "aiScenes"
        | "sceneTags"
        | "aiCaption"
        | "sceneCaption"
      >
    >,
  options: MaybeEnqueueSceneAnalysisOptions = {},
): Promise<ProcessingJob | null> {
  try {
    if (!isSceneAnalysisEnabled()) {
      console.info(`${LOG} skip enqueue — scene analysis not enabled`, {
        mediaId: row.id,
        source: options.source ?? "pipeline.maybeEnqueue",
      });
      return null;
    }
    if (!isEligibleSceneMedia(row)) {
      console.info(`${LOG} skip enqueue — not eligible clean media`, {
        mediaId: row.id,
        type: row.type,
        status: row.status,
        moderationStatus: row.moderationStatus,
      });
      return null;
    }

    if (await hasActiveSceneAnalysisJob(row.id)) {
      console.info(`${LOG} skip enqueue — active media.scene job`, {
        mediaId: row.id,
      });
      return null;
    }

    const labelRow = {
      aiTags: row.aiTags ?? [],
      aiObjects: row.aiObjects ?? [],
      aiScenes: row.aiScenes ?? [],
      sceneTags: row.sceneTags ?? [],
      aiCaption: row.aiCaption ?? null,
      sceneCaption: row.sceneCaption ?? null,
      visualAnalyzedAt: row.visualAnalyzedAt ?? null,
    };

    // Only skip when labels are already searchable (not merely status=ready).
    if (
      !options.force &&
      row.sceneAnalysisStatus === "ready" &&
      hasSearchableVisualLabels(labelRow)
    ) {
      console.info(`${LOG} skip enqueue — already has visual labels`, {
        mediaId: row.id,
      });
      return null;
    }

    const job = await enqueueSceneAnalysisJob({
      mediaId: row.id,
      userId: row.userId,
      force: options.force,
      delayMs: options.delayMs ?? 1_500,
      extra: {
        source: options.source ?? "pipeline.maybeEnqueue",
      },
    });

    console.info(`${LOG} media.scene enqueued`, {
      mediaId: row.id,
      jobId: job.id,
      source: options.source ?? "pipeline.maybeEnqueue",
    });
    return job;
  } catch (error) {
    console.error(`${LOG} enqueue failed (non-fatal)`, {
      mediaId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Admin/dev helper: enqueue scene analysis for unlabeled clean media.
 * Never blocks Ask AI — call from admin tools only.
 */
export async function enqueueUnlabeledSceneAnalysisForUser(
  userId: string,
  options: {
    limit?: number;
    force?: boolean;
    source?: string;
  } = {},
): Promise<{ scanned: number; enqueued: number; jobIds: string[] }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const db = getDb();

  const rows = await db
    .select()
    .from(media)
    .where(
      and(
        cleanReadyMediaFilter(userId),
        or(
          isNull(media.visualAnalyzedAt),
          and(
            sql`coalesce(jsonb_array_length(${media.aiTags}), 0) = 0`,
            sql`coalesce(jsonb_array_length(${media.aiObjects}), 0) = 0`,
            sql`coalesce(jsonb_array_length(${media.aiScenes}), 0) = 0`,
            sql`coalesce(jsonb_array_length(${media.sceneTags}), 0) = 0`,
            isNull(media.aiCaption),
            isNull(media.sceneCaption),
          ),
        ),
      ),
    )
    .limit(limit);

  const jobIds: string[] = [];
  for (const row of rows) {
    const job = await maybeEnqueueSceneAnalysisForMedia(row, {
      force: options.force ?? true,
      source: options.source ?? "admin.enqueue-unlabeled",
      delayMs: 500,
    });
    if (job?.id) jobIds.push(job.id);
  }

  console.info(`${LOG} unlabeled batch enqueue`, {
    userId,
    scanned: rows.length,
    enqueued: jobIds.length,
    source: options.source ?? "admin.enqueue-unlabeled",
  });

  return { scanned: rows.length, enqueued: jobIds.length, jobIds };
}

/**
 * Best-effort backfill when a user opens Photos — enqueue a small batch of
 * their own unlabeled clean media. Never throws; never blocks the page.
 */
export async function maybeBackfillUnlabeledSceneAnalysisForUser(
  userId: string,
  options?: { limit?: number },
): Promise<void> {
  try {
    if (!isSceneAnalysisEnabled()) return;
    await enqueueUnlabeledSceneAnalysisForUser(userId, {
      limit: options?.limit ?? 8,
      force: false,
      source: "pipeline.photos_backfill",
    });
  } catch (error) {
    console.error(`${LOG} photos backfill failed (non-fatal)`, {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Process one media id (worker entry).
 */
export async function processSceneAnalysisForMedia(
  mediaId: string,
  options?: { force?: boolean },
) {
  return analyzeAndStoreSceneForMedia(mediaId, options);
}

/**
 * Load media row for enqueue helpers that only have an id.
 */
export async function loadMediaForSceneEnqueue(
  mediaId: string,
): Promise<Media | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);
  return row ?? null;
}
