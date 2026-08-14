import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { media, processingJobs, type ProcessingJob } from "@/lib/db/schema";
import { isSafeToServe } from "@/lib/moderation/types";

export type QueueJobType =
  | "moderation"
  | "moderation.scan"
  | "moderation.photodna"
  | "moderation.report_ncmec"
  | "face.detect"
  | "media.scene"
  | "movie.render"
  | "media.transcode"
  | "media.thumbnail";

export const MODERATION_JOB_TYPES = [
  "moderation",
  "moderation.scan",
] as const satisfies readonly QueueJobType[];

export const FACE_DETECTION_JOB_TYPES = [
  "face.detect",
] as const satisfies readonly QueueJobType[];

export const SCENE_ANALYSIS_JOB_TYPES = [
  "media.scene",
] as const satisfies readonly QueueJobType[];

export const MOVIE_RENDER_JOB_TYPES = [
  "movie.render",
] as const satisfies readonly QueueJobType[];

export type EnqueueOptions = {
  type: QueueJobType | (string & {});
  payload: Record<string, unknown>;
  mediaId?: string;
  /** Delay before the job becomes available (ms). */
  delayMs?: number;
  maxAttempts?: number;
};

/**
 * Database-backed queue helpers over `processing_jobs`.
 * Replace with Cloudflare Queues later without changing call sites much.
 */
export async function enqueueJob(
  options: EnqueueOptions,
): Promise<ProcessingJob> {
  const db = getDb();
  const now = new Date();
  const availableAt = new Date(now.getTime() + (options.delayMs ?? 0));
  const maxAttempts =
    options.maxAttempts ?? Number(process.env.QUEUE_MAX_ATTEMPTS ?? 5);

  const [job] = await db
    .insert(processingJobs)
    .values({
      id: nanoid(),
      mediaId: options.mediaId,
      type: options.type,
      payload: options.payload,
      status: "pending",
      attempts: 0,
      maxAttempts,
      availableAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!job) {
    throw new Error("Failed to enqueue processing job — insert returned no row.");
  }

  return job;
}

export type EnqueueModerationJobInput = {
  mediaId: string;
  originalKey: string;
  contentType?: string;
  userId?: string;
  /** Extra payload fields for debugging / workers */
  extra?: Record<string, unknown>;
  maxAttempts?: number;
};

/**
 * Reliably enqueue a primary `moderation` job for a media row.
 * Retries briefly on transient DB failures. Payload always includes mediaId + originalKey.
 */
export async function enqueueModerationJob(
  input: EnqueueModerationJobInput,
): Promise<ProcessingJob> {
  if (!input.mediaId?.trim()) {
    throw new Error("enqueueModerationJob requires mediaId.");
  }
  if (!input.originalKey?.trim()) {
    throw new Error("enqueueModerationJob requires originalKey.");
  }

  const payload: Record<string, unknown> = {
    mediaId: input.mediaId,
    originalKey: input.originalKey,
    key: input.originalKey,
    ...(input.contentType ? { contentType: input.contentType } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.extra ?? {}),
    enqueuedAt: new Date().toISOString(),
  };

  const attempts = 3;
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      const job = await enqueueJob({
        type: "moderation",
        mediaId: input.mediaId,
        payload,
        maxAttempts: input.maxAttempts,
      });
      console.info("[queue] moderation job enqueued", {
        jobId: job.id,
        mediaId: input.mediaId,
        originalKey: input.originalKey,
        attempt: i,
      });
      return job;
    } catch (error) {
      lastError = error;
      console.error("[queue] enqueueModerationJob attempt failed", {
        attempt: i,
        mediaId: input.mediaId,
        error,
      });
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, 150 * i));
      }
    }
  }

  throw new Error(
    `Failed to enqueue moderation job for media ${input.mediaId} after ${attempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export type EnqueueFaceDetectionJobInput = {
  mediaId: string;
  userId?: string;
  /** Re-run detection even if faces already exist. */
  replaceExisting?: boolean;
  extra?: Record<string, unknown>;
  maxAttempts?: number;
  delayMs?: number;
};

/**
 * Enqueue a `face.detect` job (detect + group). Requires clean/ready photo/video.
 * `userId` is the actor (People owner): media owner or a family viewer who can
 * view the media. Jobs for viewers store faces under that viewer.
 */
export async function enqueueFaceDetectionJob(
  input: EnqueueFaceDetectionJobInput,
): Promise<ProcessingJob> {
  if (!input.mediaId?.trim()) {
    throw new Error("enqueueFaceDetectionJob requires mediaId.");
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: media.id,
      userId: media.userId,
      type: media.type,
      status: media.status,
      moderationStatus: media.moderationStatus,
      contentType: media.contentType,
    })
    .from(media)
    .where(eq(media.id, input.mediaId))
    .limit(1);

  if (!row) {
    throw new Error(`enqueueFaceDetectionJob: media not found (${input.mediaId}).`);
  }

  const actorUserId = input.userId?.trim() || row.userId;
  if (actorUserId !== row.userId) {
    const { canViewMedia } = await import("@/lib/permissions");
    if (!(await canViewMedia(actorUserId, input.mediaId))) {
      throw new Error(
        "enqueueFaceDetectionJob: user cannot access this media.",
      );
    }
  }

  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    throw new Error(
      `enqueueFaceDetectionJob: media ${input.mediaId} must be clean/ready.`,
    );
  }

  const ct = row.contentType?.toLowerCase() ?? "";
  if (row.type === "photo") {
    if (ct && !ct.startsWith("image/")) {
      throw new Error(
        `enqueueFaceDetectionJob: media ${input.mediaId} must be an image.`,
      );
    }
  } else if (row.type === "video") {
    if (ct && !ct.startsWith("video/")) {
      throw new Error(
        `enqueueFaceDetectionJob: media ${input.mediaId} must be a video.`,
      );
    }
  } else {
    throw new Error(
      `enqueueFaceDetectionJob: media ${input.mediaId} must be a photo or video.`,
    );
  }

  const payload: Record<string, unknown> = {
    mediaId: input.mediaId,
    userId: actorUserId,
    ...(input.replaceExisting ? { replaceExisting: true } : {}),
    ...(input.extra ?? {}),
    enqueuedAt: new Date().toISOString(),
  };

  const attempts = 3;
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      const job = await enqueueJob({
        type: "face.detect",
        mediaId: input.mediaId,
        payload,
        maxAttempts: input.maxAttempts,
        delayMs: input.delayMs,
      });
      console.info("[queue] face.detect job enqueued", {
        jobId: job.id,
        mediaId: input.mediaId,
        actorUserId,
        attempt: i,
      });
      return job;
    } catch (error) {
      lastError = error;
      console.error("[queue] enqueueFaceDetectionJob attempt failed", {
        attempt: i,
        mediaId: input.mediaId,
        error,
      });
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, 150 * i));
      }
    }
  }

  throw new Error(
    `Failed to enqueue face.detect job for media ${input.mediaId} after ${attempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/**
 * True when a face.detect job is already pending/processing for this media.
 * When `actorUserId` is set, only jobs for that actor count (so owner + family
 * viewer jobs can coexist).
 */
export async function hasActiveFaceDetectionJob(
  mediaId: string,
  actorUserId?: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({
      id: processingJobs.id,
      payload: processingJobs.payload,
    })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.mediaId, mediaId),
        inArray(processingJobs.type, [...FACE_DETECTION_JOB_TYPES]),
        inArray(processingJobs.status, ["pending", "processing"]),
      ),
    );

  if (!actorUserId) {
    return rows.length > 0;
  }

  for (const row of rows) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const payloadUserId =
      typeof payload.userId === "string" ? payload.userId : undefined;
    if (payloadUserId === actorUserId) return true;
  }
  return false;
}

export type EnqueueSceneAnalysisJobInput = {
  mediaId: string;
  userId?: string;
  force?: boolean;
  delayMs?: number;
  maxAttempts?: number;
  extra?: Record<string, unknown>;
};

/**
 * Enqueue a media.scene job for a clean/ready photo.
 */
export async function enqueueSceneAnalysisJob(
  input: EnqueueSceneAnalysisJobInput,
): Promise<ProcessingJob> {
  if (!input.mediaId?.trim()) {
    throw new Error("enqueueSceneAnalysisJob requires mediaId.");
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: media.id,
      userId: media.userId,
      type: media.type,
      status: media.status,
      moderationStatus: media.moderationStatus,
      contentType: media.contentType,
    })
    .from(media)
    .where(eq(media.id, input.mediaId))
    .limit(1);

  if (!row) {
    throw new Error(`enqueueSceneAnalysisJob: media not found (${input.mediaId}).`);
  }

  if (input.userId && input.userId !== row.userId) {
    throw new Error("enqueueSceneAnalysisJob: userId does not own this media.");
  }

  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    throw new Error(
      `enqueueSceneAnalysisJob: media ${input.mediaId} must be clean/ready.`,
    );
  }

  if (row.type !== "photo" && row.type !== "video") {
    throw new Error(
      `enqueueSceneAnalysisJob: media ${input.mediaId} must be a photo or video.`,
    );
  }

  const sceneCt = row.contentType?.toLowerCase() ?? "";
  if (row.type === "photo" && sceneCt && !sceneCt.startsWith("image/")) {
    throw new Error(
      `enqueueSceneAnalysisJob: media ${input.mediaId} must be an image.`,
    );
  }
  if (row.type === "video" && sceneCt && !sceneCt.startsWith("video/")) {
    throw new Error(
      `enqueueSceneAnalysisJob: media ${input.mediaId} must be a video.`,
    );
  }

  const ownerUserId = input.userId ?? row.userId;
  const payload: Record<string, unknown> = {
    mediaId: input.mediaId,
    userId: ownerUserId,
    ...(input.force ? { force: true } : {}),
    ...(input.extra ?? {}),
    enqueuedAt: new Date().toISOString(),
  };

  const attempts = 3;
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      const job = await enqueueJob({
        type: "media.scene",
        mediaId: input.mediaId,
        payload,
        maxAttempts: input.maxAttempts,
        delayMs: input.delayMs,
      });
      console.info("[queue] media.scene job enqueued", {
        jobId: job.id,
        mediaId: input.mediaId,
        attempt: i,
      });
      return job;
    } catch (error) {
      lastError = error;
      console.error("[queue] enqueueSceneAnalysisJob attempt failed", {
        attempt: i,
        mediaId: input.mediaId,
        error,
      });
      if (i < attempts) {
        await new Promise((r) => setTimeout(r, 150 * i));
      }
    }
  }

  throw new Error(
    `Failed to enqueue media.scene job for media ${input.mediaId} after ${attempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/** True when a media.scene job is already pending or processing for this media. */
export async function hasActiveSceneAnalysisJob(
  mediaId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: processingJobs.id })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.mediaId, mediaId),
        inArray(processingJobs.type, [...SCENE_ANALYSIS_JOB_TYPES]),
        inArray(processingJobs.status, ["pending", "processing"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type ClaimJobOptions = {
  /** Restrict to these job types (e.g. moderation). */
  types?: readonly string[];
};

/**
 * Claim the next available pending job (simple single-worker lease).
 * For multi-worker production, prefer SKIP LOCKED / Cloudflare Queues.
 */
export async function claimNextJob(
  options?: ClaimJobOptions,
): Promise<ProcessingJob | null> {
  const db = getDb();
  const now = new Date();

  const conditions = [
    eq(processingJobs.status, "pending"),
    lte(processingJobs.availableAt, now),
  ];

  if (options?.types && options.types.length > 0) {
    conditions.push(inArray(processingJobs.type, [...options.types]));
  }

  const [next] = await db
    .select()
    .from(processingJobs)
    .where(and(...conditions))
    .orderBy(asc(processingJobs.availableAt), asc(processingJobs.createdAt))
    .limit(1);

  if (!next) return null;

  const [claimed] = await db
    .update(processingJobs)
    .set({
      status: "processing",
      attempts: sql`${processingJobs.attempts} + 1`,
      startedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(processingJobs.id, next.id),
        eq(processingJobs.status, "pending"),
      ),
    )
    .returning();

  return claimed ?? null;
}

/** Claim the next moderation-related job. */
export async function claimNextModerationJob(): Promise<ProcessingJob | null> {
  return claimNextJob({ types: MODERATION_JOB_TYPES });
}

/** Claim the next face detection job. */
export async function claimNextFaceDetectionJob(): Promise<ProcessingJob | null> {
  return claimNextJob({ types: FACE_DETECTION_JOB_TYPES });
}

/** Claim the next scene analysis job. */
export async function claimNextSceneAnalysisJob(): Promise<ProcessingJob | null> {
  return claimNextJob({ types: SCENE_ANALYSIS_JOB_TYPES });
}

/** Claim the next movie.render job. */
export async function claimNextMovieRenderJob(): Promise<ProcessingJob | null> {
  return claimNextJob({ types: MOVIE_RENDER_JOB_TYPES });
}

/**
 * Requeue jobs stuck in `processing` longer than `staleAfterMs`
 * (crashed worker / timed-out request). Idempotent for healthy workers.
 */
export async function reclaimStaleProcessingJobs(
  staleAfterMs = Number(process.env.QUEUE_STALE_PROCESSING_MS ?? 15 * 60 * 1000),
  types: readonly string[] = MODERATION_JOB_TYPES,
): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - staleAfterMs);

  const reclaimed = await db
    .update(processingJobs)
    .set({
      status: "pending",
      lastError: "Reclaimed after stale processing lease (worker crash/timeout).",
      availableAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(processingJobs.status, "processing"),
        lte(processingJobs.startedAt, cutoff),
        inArray(processingJobs.type, [...types]),
      ),
    )
    .returning({ id: processingJobs.id });

  return reclaimed.length;
}

export async function reclaimStaleFaceDetectionJobs(
  staleAfterMs?: number,
): Promise<number> {
  return reclaimStaleProcessingJobs(staleAfterMs, FACE_DETECTION_JOB_TYPES);
}

export async function reclaimStaleSceneAnalysisJobs(
  staleAfterMs?: number,
): Promise<number> {
  return reclaimStaleProcessingJobs(staleAfterMs, SCENE_ANALYSIS_JOB_TYPES);
}

/** Movies can take longer than moderation — default stale lease 20 minutes. */
export async function reclaimStaleMovieRenderJobs(
  staleAfterMs = Number(
    process.env.MOVIE_QUEUE_STALE_PROCESSING_MS ??
      process.env.QUEUE_STALE_PROCESSING_MS ??
      20 * 60 * 1000,
  ),
): Promise<number> {
  return reclaimStaleProcessingJobs(staleAfterMs, MOVIE_RENDER_JOB_TYPES);
}

/** True when a movie.render job is already pending/processing for this movie. */
export async function hasActiveMovieRenderJob(
  movieId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: processingJobs.id })
    .from(processingJobs)
    .where(
      and(
        inArray(processingJobs.type, [...MOVIE_RENDER_JOB_TYPES]),
        inArray(processingJobs.status, ["pending", "processing"]),
        sql`(${processingJobs.payload}->>'movieId') = ${movieId}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function completeJob(jobId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(processingJobs)
    .set({
      status: "completed",
      processedAt: now,
      updatedAt: now,
      lastError: null,
    })
    .where(eq(processingJobs.id, jobId));
}

export async function failJob(
  jobId: string,
  error: string,
  options?: { retryDelayMs?: number },
): Promise<{ willRetry: boolean }> {
  const db = getDb();
  const now = new Date();

  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (!job) return { willRetry: false };

  const shouldRetry = job.attempts < job.maxAttempts;
  const retryDelay = options?.retryDelayMs ?? 30_000;

  await db
    .update(processingJobs)
    .set({
      status: shouldRetry ? "pending" : "failed",
      lastError: error.slice(0, 2000),
      availableAt: shouldRetry
        ? new Date(now.getTime() + retryDelay)
        : job.availableAt,
      updatedAt: now,
      processedAt: shouldRetry ? null : now,
    })
    .where(eq(processingJobs.id, jobId));

  return { willRetry: shouldRetry };
}

/** @deprecated Prefer ProcessingJob from schema */
export type QueueJob = ProcessingJob;
