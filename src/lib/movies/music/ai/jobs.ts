/**
 * Async AI soundtrack jobs via processing_jobs + after()-style runners.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { processingJobs, type ProcessingJob } from "@/lib/db/schema";
import { completeJob, enqueueJob } from "@/lib/queue";
import { MovieError } from "@/lib/movies/errors";
import {
  clampAiSoundtrackDurationMs,
  generateAndStoreAiSoundtrack,
} from "@/lib/movies/music/ai/generate";
import {
  AI_SOUNDTRACK_JOB_TYPE,
  type AiSoundtrackJobPayload,
  type AiSoundtrackStage,
} from "@/lib/movies/music/ai/types";
import { resolveConfiguredMusicProvider } from "@/lib/movies/music/ai/registry";

function nowIso(): string {
  return new Date().toISOString();
}

async function patchJobPayload(
  jobId: string,
  patch: Partial<AiSoundtrackJobPayload>,
  status?: "pending" | "processing" | "completed" | "failed",
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);
  if (!row) return;

  const prev = (row.payload ?? {}) as AiSoundtrackJobPayload;
  const next: AiSoundtrackJobPayload = {
    ...prev,
    ...patch,
    updatedAt: nowIso(),
  };

  await db
    .update(processingJobs)
    .set({
      payload: next,
      ...(status ? { status } : {}),
      updatedAt: new Date(),
      ...(status === "processing" && !row.startedAt
        ? { startedAt: new Date() }
        : {}),
    })
    .where(eq(processingJobs.id, jobId));
}

export async function enqueueAiSoundtrackJob(input: {
  userId: string;
  themeId?: string | null;
  mood?: string | null;
  userPrompt?: string | null;
  durationSeconds: number;
  forceInstrumental?: boolean;
  providerId?: string;
}): Promise<ProcessingJob> {
  const provider =
    resolveConfiguredMusicProvider(input.providerId) ??
    (() => {
      throw new MovieError(
        "AI soundtrack generation is not configured.",
        { retryable: false, code: "validation" },
      );
    })();

  const durationMs = clampAiSoundtrackDurationMs(input.durationSeconds);
  const createdAt = nowIso();
  const payload: AiSoundtrackJobPayload = {
    userId: input.userId,
    themeId: input.themeId ?? null,
    mood: input.mood ?? null,
    userPrompt: input.userPrompt?.trim().slice(0, 240) || null,
    durationMs,
    forceInstrumental: input.forceInstrumental !== false,
    providerId: provider.id,
    stage: "queued",
    progressPercent: 5,
    statusMessage: "Queued…",
    createdAt,
    updatedAt: createdAt,
  };

  return enqueueJob({
    type: AI_SOUNDTRACK_JOB_TYPE,
    payload,
    maxAttempts: 2,
  });
}

export async function processAiSoundtrackJob(jobId: string): Promise<void> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (!job || job.type !== AI_SOUNDTRACK_JOB_TYPE) {
    throw new MovieError("Soundtrack job not found.", {
      retryable: false,
      code: "not_found",
    });
  }

  const payload = job.payload as AiSoundtrackJobPayload;
  if (!payload?.userId) {
    throw new MovieError("Soundtrack job is missing userId.", {
      retryable: false,
      code: "validation",
    });
  }

  if (job.status === "completed" && payload.stage === "ready" && payload.resultKey) {
    return;
  }

  await db
    .update(processingJobs)
    .set({
      status: "processing",
      startedAt: job.startedAt ?? new Date(),
      updatedAt: new Date(),
      attempts: sql`GREATEST(${processingJobs.attempts}, 1)`,
    })
    .where(eq(processingJobs.id, jobId));

  try {
    await patchJobPayload(jobId, {
      stage: "generating" satisfies AiSoundtrackStage,
      progressPercent: 25,
      statusMessage: "Generating soundtrack…",
    });

    const stored = await generateAndStoreAiSoundtrack(
      {
        userId: payload.userId,
        themeId: payload.themeId,
        mood: payload.mood,
        userPrompt: payload.userPrompt,
        durationSeconds: payload.durationMs / 1000,
        forceInstrumental: payload.forceInstrumental,
        providerId: payload.providerId,
      },
      {
        onProgress: async (stage, message) => {
          await patchJobPayload(jobId, {
            stage,
            progressPercent: stage === "generating" ? 45 : 80,
            statusMessage: message,
          });
        },
      },
    );

    await patchJobPayload(
      jobId,
      {
        stage: "ready",
        progressPercent: 100,
        statusMessage: "Ready",
        resultKey: stored.key,
        resultContentType: stored.contentType,
        resultLabel: stored.label,
        providerTrackId: stored.providerTrackId,
        modelId: stored.modelId,
        composedPrompt: stored.composedPrompt,
        error: null,
      },
      "completed",
    );
    await completeJob(jobId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Soundtrack generation failed.";
    await patchJobPayload(jobId, {
      stage: "failed",
      progressPercent: 100,
      statusMessage: "Failed",
      error: message.slice(0, 500),
    });
    // Do not auto-retry expensive generations — mark failed once.
    await db
      .update(processingJobs)
      .set({
        status: "failed",
        lastError: message.slice(0, 2000),
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(processingJobs.id, jobId));
  }
}

export async function getAiSoundtrackJobForUser(
  jobId: string,
  userId: string,
): Promise<{
  job: ProcessingJob;
  payload: AiSoundtrackJobPayload;
} | null> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.id, jobId),
        eq(processingJobs.type, AI_SOUNDTRACK_JOB_TYPE),
      ),
    )
    .limit(1);

  if (!job) return null;
  const payload = job.payload as AiSoundtrackJobPayload;
  if (payload?.userId !== userId) return null;
  return { job, payload };
}

export function serializeAiSoundtrackJob(
  job: ProcessingJob,
  payload: AiSoundtrackJobPayload,
) {
  return {
    jobId: job.id,
    status: job.status,
    stage: payload.stage,
    progressPercent: payload.progressPercent,
    statusMessage: payload.statusMessage ?? null,
    error: payload.error ?? job.lastError ?? null,
    result: payload.resultKey
      ? {
          key: payload.resultKey,
          contentType: payload.resultContentType ?? "audio/mpeg",
          label: payload.resultLabel ?? "AI-generated soundtrack",
          musicSource: "upload" as const,
          musicAiGenerated: true,
          providerId: payload.providerId,
        }
      : null,
    durationMs: payload.durationMs,
    userPrompt: payload.userPrompt ?? null,
    providerId: payload.providerId,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}
