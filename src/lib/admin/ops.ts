/**
 * Admin ops / system health — queue status, failures, pipeline signals.
 */

import { and, asc, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { assertAdminUser } from "@/lib/auth/admin";
import { formatBytes } from "@/lib/billing/quotas";
import { getDb } from "@/lib/db";
import {
  media,
  movies,
  processingJobs,
  type ProcessingJob,
} from "@/lib/db/schema";
import {
  FACE_DETECTION_JOB_TYPES,
  MODERATION_JOB_TYPES,
  MOVIE_RENDER_JOB_TYPES,
  SCENE_ANALYSIS_JOB_TYPES,
} from "@/lib/queue";

export type JobStatusCounts = {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
};

export type PipelineHealth = {
  key: "moderation" | "faces" | "scene" | "movies";
  label: string;
  pending: number;
  processing: number;
  failed: number;
  completed7d: number;
  failed7d: number;
  /** Oldest pending job age in minutes (null if none). */
  oldestPendingAgeMinutes: number | null;
  /** Heuristic: ok | attention | critical */
  status: "ok" | "attention" | "critical";
  detail: string;
};

export type FailedJobSummary = {
  id: string;
  type: string;
  mediaId: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
  payload: Record<string, unknown>;
};

export type AdminOpsOverview = {
  generatedAt: Date;
  jobsByStatus: JobStatusCounts;
  jobsByType: Array<{ type: string; pending: number; processing: number; failed: number }>;
  pipelines: PipelineHealth[];
  storage: {
    totalBytes: number;
    totalLabel: string;
    mediaCount: number;
    quarantinedBytes: number;
    quarantinedLabel: string;
  };
  movies: {
    total: number;
    ready: number;
    failed: number;
    processing: number;
    queued: number;
    successRate7d: number | null;
    failedRate7d: number | null;
    created7d: number;
    ready7d: number;
    failed7d: number;
  };
  recentFailedJobs: FailedJobSummary[];
  recentErrors: Array<{
    id: string;
    type: string;
    lastError: string;
    status: string;
    updatedAt: Date;
  }>;
};

const PIPELINE_TYPES = {
  moderation: [...MODERATION_JOB_TYPES] as string[],
  faces: [...FACE_DETECTION_JOB_TYPES] as string[],
  scene: [...SCENE_ANALYSIS_JOB_TYPES] as string[],
  movies: [...MOVIE_RENDER_JOB_TYPES] as string[],
} as const;

function emptyStatusCounts(): JobStatusCounts {
  return {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  };
}

function healthFor(input: {
  pending: number;
  processing: number;
  failed: number;
  failed7d: number;
  completed7d: number;
  oldestPendingAgeMinutes: number | null;
}): Pick<PipelineHealth, "status" | "detail"> {
  if (input.failed > 10 || (input.oldestPendingAgeMinutes ?? 0) > 120) {
    return {
      status: "critical",
      detail:
        input.failed > 10
          ? `${input.failed} failed jobs need attention`
          : `Oldest pending job is ${input.oldestPendingAgeMinutes}m old`,
    };
  }
  if (
    input.failed > 0 ||
    (input.oldestPendingAgeMinutes ?? 0) > 30 ||
    (input.failed7d > 0 &&
      input.completed7d + input.failed7d > 0 &&
      input.failed7d / (input.completed7d + input.failed7d) > 0.2)
  ) {
    return {
      status: "attention",
      detail:
        input.failed > 0
          ? `${input.failed} failed job(s)`
          : input.oldestPendingAgeMinutes != null &&
              input.oldestPendingAgeMinutes > 30
            ? `Queue backlog (~${input.oldestPendingAgeMinutes}m)`
            : "Elevated failure rate in the last 7 days",
    };
  }
  if (input.pending + input.processing === 0 && input.failed === 0) {
    return { status: "ok", detail: "Queue clear" };
  }
  return {
    status: "ok",
    detail: `${input.pending} pending · ${input.processing} processing`,
  };
}

async function pipelineStats(
  types: string[],
  since7d: Date,
): Promise<{
  pending: number;
  processing: number;
  failed: number;
  completed7d: number;
  failed7d: number;
  oldestPendingAgeMinutes: number | null;
}> {
  const db = getDb();
  const [byStatus, [oldestPending], [completed7d], [failed7d]] =
    await Promise.all([
      db
        .select({
          status: processingJobs.status,
          value: count(),
        })
        .from(processingJobs)
        .where(inArray(processingJobs.type, types))
        .groupBy(processingJobs.status),
      db
        .select({ availableAt: processingJobs.availableAt })
        .from(processingJobs)
        .where(
          and(
            inArray(processingJobs.type, types),
            eq(processingJobs.status, "pending"),
          ),
        )
        .orderBy(asc(processingJobs.availableAt))
        .limit(1),
      db
        .select({ value: count() })
        .from(processingJobs)
        .where(
          and(
            inArray(processingJobs.type, types),
            eq(processingJobs.status, "completed"),
            gte(processingJobs.processedAt, since7d),
          ),
        ),
      db
        .select({ value: count() })
        .from(processingJobs)
        .where(
          and(
            inArray(processingJobs.type, types),
            eq(processingJobs.status, "failed"),
            gte(processingJobs.updatedAt, since7d),
          ),
        ),
    ]);

  const map = Object.fromEntries(
    byStatus.map((r) => [r.status, Number(r.value)]),
  ) as Record<string, number>;

  const oldestPendingAgeMinutes = oldestPending?.availableAt
    ? Math.max(
        0,
        Math.round(
          (Date.now() - oldestPending.availableAt.getTime()) / 60_000,
        ),
      )
    : null;

  return {
    pending: map.pending ?? 0,
    processing: map.processing ?? 0,
    failed: map.failed ?? 0,
    completed7d: Number(completed7d?.value ?? 0),
    failed7d: Number(failed7d?.value ?? 0),
    oldestPendingAgeMinutes,
  };
}

export async function getAdminOpsOverview(
  actorUserId: string,
): Promise<AdminOpsOverview> {
  await assertAdminUser(actorUserId);

  const db = getDb();
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    statusRows,
    typeRows,
    [storageTotal],
    [storageQuarantine],
    [mediaCount],
    movieStatusRows,
    [moviesCreated7d],
    [moviesReady7d],
    [moviesFailed7d],
    failedJobs,
    recentErrorJobs,
    moderationPipe,
    facesPipe,
    scenePipe,
    moviesPipe,
  ] = await Promise.all([
    db
      .select({
        status: processingJobs.status,
        value: count(),
      })
      .from(processingJobs)
      .groupBy(processingJobs.status),
    db
      .select({
        type: processingJobs.type,
        status: processingJobs.status,
        value: count(),
      })
      .from(processingJobs)
      .where(inArray(processingJobs.status, ["pending", "processing", "failed"]))
      .groupBy(processingJobs.type, processingJobs.status),
    db
      .select({
        bytes: sql<number>`coalesce(sum(${media.byteSize}), 0)`,
      })
      .from(media)
      .where(ne(media.status, "csam_quarantined")),
    db
      .select({
        bytes: sql<number>`coalesce(sum(${media.byteSize}), 0)`,
      })
      .from(media)
      .where(eq(media.status, "csam_quarantined")),
    db.select({ value: count() }).from(media),
    db
      .select({
        status: movies.status,
        value: count(),
      })
      .from(movies)
      .groupBy(movies.status),
    db
      .select({ value: count() })
      .from(movies)
      .where(gte(movies.createdAt, since7d)),
    db
      .select({ value: count() })
      .from(movies)
      .where(
        and(eq(movies.status, "ready"), gte(movies.completedAt, since7d)),
      ),
    db
      .select({ value: count() })
      .from(movies)
      .where(and(eq(movies.status, "failed"), gte(movies.updatedAt, since7d))),
    db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.status, "failed"))
      .orderBy(desc(processingJobs.updatedAt))
      .limit(25),
    db
      .select({
        id: processingJobs.id,
        type: processingJobs.type,
        lastError: processingJobs.lastError,
        status: processingJobs.status,
        updatedAt: processingJobs.updatedAt,
      })
      .from(processingJobs)
      .where(
        and(
          sql`${processingJobs.lastError} is not null`,
          sql`${processingJobs.lastError} <> ''`,
        ),
      )
      .orderBy(desc(processingJobs.updatedAt))
      .limit(20),
    pipelineStats(PIPELINE_TYPES.moderation, since7d),
    pipelineStats(PIPELINE_TYPES.faces, since7d),
    pipelineStats(PIPELINE_TYPES.scene, since7d),
    pipelineStats(PIPELINE_TYPES.movies, since7d),
  ]);

  const jobsByStatus = emptyStatusCounts();
  for (const row of statusRows) {
    jobsByStatus[row.status] = Number(row.value);
    jobsByStatus.total += Number(row.value);
  }

  const typeMap = new Map<
    string,
    { type: string; pending: number; processing: number; failed: number }
  >();
  for (const row of typeRows) {
    const cur = typeMap.get(row.type) ?? {
      type: row.type,
      pending: 0,
      processing: 0,
      failed: 0,
    };
    if (row.status === "pending") cur.pending = Number(row.value);
    if (row.status === "processing") cur.processing = Number(row.value);
    if (row.status === "failed") cur.failed = Number(row.value);
    typeMap.set(row.type, cur);
  }

  const movieMap = Object.fromEntries(
    movieStatusRows.map((r) => [r.status, Number(r.value)]),
  ) as Record<string, number>;

  const ready7d = Number(moviesReady7d?.value ?? 0);
  const failed7d = Number(moviesFailed7d?.value ?? 0);
  const decided7d = ready7d + failed7d;

  const buildPipe = (
    key: PipelineHealth["key"],
    label: string,
    stats: Awaited<ReturnType<typeof pipelineStats>>,
  ): PipelineHealth => {
    const { status, detail } = healthFor(stats);
    return { key, label, ...stats, status, detail };
  };

  const totalBytes = Number(storageTotal?.bytes ?? 0);
  const quarantinedBytes = Number(storageQuarantine?.bytes ?? 0);

  return {
    generatedAt: now,
    jobsByStatus,
    jobsByType: [...typeMap.values()].sort((a, b) =>
      a.type.localeCompare(b.type),
    ),
    pipelines: [
      buildPipe("moderation", "Moderation", moderationPipe),
      buildPipe("faces", "Face detection", facesPipe),
      buildPipe("scene", "Scene analysis", scenePipe),
      buildPipe("movies", "Movie render", moviesPipe),
    ],
    storage: {
      totalBytes,
      totalLabel: formatBytes(totalBytes, 1),
      mediaCount: Number(mediaCount?.value ?? 0),
      quarantinedBytes,
      quarantinedLabel: formatBytes(quarantinedBytes, 1),
    },
    movies: {
      total: Object.values(movieMap).reduce((a, b) => a + b, 0),
      ready: movieMap.ready ?? 0,
      failed: movieMap.failed ?? 0,
      processing: movieMap.processing ?? 0,
      queued: movieMap.queued ?? 0,
      created7d: Number(moviesCreated7d?.value ?? 0),
      ready7d,
      failed7d,
      successRate7d:
        decided7d > 0 ? Math.round((ready7d / decided7d) * 1000) / 10 : null,
      failedRate7d:
        decided7d > 0 ? Math.round((failed7d / decided7d) * 1000) / 10 : null,
    },
    recentFailedJobs: failedJobs.map(toFailedSummary),
    recentErrors: recentErrorJobs.map((j) => ({
      id: j.id,
      type: j.type,
      lastError: j.lastError || "",
      status: j.status,
      updatedAt: j.updatedAt,
    })),
  };
}

function toFailedSummary(job: ProcessingJob): FailedJobSummary {
  return {
    id: job.id,
    type: job.type,
    mediaId: job.mediaId,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lastError: job.lastError,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    processedAt: job.processedAt,
    payload: job.payload ?? {},
  };
}

export async function getFailedJobDetail(
  actorUserId: string,
  jobId: string,
): Promise<FailedJobSummary | null> {
  await assertAdminUser(actorUserId);
  const db = getDb();
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);
  if (!job) return null;
  return toFailedSummary(job);
}

/**
 * Re-queue a failed (or stuck processing) job for another attempt.
 * Resets status to pending, clears lastError, sets availableAt to now.
 * Optionally resets attempts so the job gets a full retry budget.
 */
export async function retryProcessingJob(
  actorUserId: string,
  jobId: string,
  options?: { resetAttempts?: boolean },
): Promise<FailedJobSummary> {
  await assertAdminUser(actorUserId);
  const db = getDb();
  const now = new Date();

  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error("Job not found.");
  }

  if (job.status !== "failed" && job.status !== "processing") {
    throw new Error(
      `Only failed or stuck processing jobs can be retried (status=${job.status}).`,
    );
  }

  const [updated] = await db
    .update(processingJobs)
    .set({
      status: "pending",
      lastError: null,
      availableAt: now,
      startedAt: null,
      processedAt: null,
      attempts: options?.resetAttempts ? 0 : job.attempts,
      updatedAt: now,
    })
    .where(eq(processingJobs.id, jobId))
    .returning();

  if (!updated) {
    throw new Error("Failed to update job.");
  }

  const { logAdminAudit } = await import("@/lib/admin/audit");
  await logAdminAudit({
    actorId: actorUserId,
    action: "job.retry",
    targetType: "processing_job",
    targetId: jobId,
    metadata: {
      type: job.type,
      previousStatus: job.status,
      resetAttempts: Boolean(options?.resetAttempts),
      mediaId: job.mediaId,
    },
  });

  return toFailedSummary(updated);
}
