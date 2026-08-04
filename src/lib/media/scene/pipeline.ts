/**
 * Best-effort enqueue for scene analysis after media is clean/ready.
 */

import { getDb } from "@/lib/db";
import { media, type Media, type ProcessingJob } from "@/lib/db/schema";
import {
  analyzeAndStoreSceneForMedia,
  isEligibleSceneMedia,
  isSceneAnalysisEnabled,
} from "@/lib/media/scene/analyze";
import {
  enqueueSceneAnalysisJob,
  hasActiveSceneAnalysisJob,
} from "@/lib/queue";
import { eq } from "drizzle-orm";

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
    | "sceneAnalysisStatus"
    | "sceneAnalyzedAt"
    | "visualAnalyzedAt"
  >,
  options: MaybeEnqueueSceneAnalysisOptions = {},
): Promise<ProcessingJob | null> {
  try {
    if (!isSceneAnalysisEnabled()) {
      return null;
    }
    if (!isEligibleSceneMedia(row)) {
      return null;
    }

    if (await hasActiveSceneAnalysisJob(row.id)) {
      console.info(`${LOG} skip enqueue — active media.scene job`, {
        mediaId: row.id,
      });
      return null;
    }

    if (
      !options.force &&
      row.sceneAnalysisStatus === "ready" &&
      row.sceneAnalyzedAt &&
      row.visualAnalyzedAt
    ) {
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
