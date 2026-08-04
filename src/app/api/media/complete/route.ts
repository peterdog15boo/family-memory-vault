import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import { getDb } from "@/lib/db";
import { media, moderationEvents } from "@/lib/db/schema";
import { enqueueModerationJob } from "@/lib/queue";
import {
  headObjectMeta,
  isTempKey,
  promoteTempToOriginals,
  tempKeyToOriginalsKey,
} from "@/lib/r2";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import {
  logUploadCompleted,
  logUploadFailed,
} from "@/lib/observability/events";
import {
  completeMediaSchema,
  isR2Configured,
  maxBytesForContentType,
  mediaTypeFromContentType,
  resolveUploadContentType,
} from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";

/**
 * POST /api/media/complete
 *
 * SAFETY PIPELINE (entry point after browser PUT to R2):
 * 1. Validate the temp/ object belongs to the signed-in user
 * 2. HEAD the object — quota + per-type max use real ContentLength (not client size)
 * 3. Promote temp/ → originals/ (still untrusted)
 * 4. Insert media with status = pending_moderation, moderation_status = pending
 *    — NEVER ready/clean here
 * 5. Reliably enqueue a `moderation` processing_job (mediaId + originalKey)
 * 6. Return immediately — moderation/faces run in workers, not this request
 * 7. Family UIs must not show this item until the worker marks it clean/ready
 *
 * Worker: `npm run worker:moderation` or POST /api/jobs/moderation
 * Dev force-run: POST /api/dev/moderate  or  `npm run moderate:media -- --mediaId=…`
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `media-complete:${userId}`,
    RATE_LIMITS.mediaComplete.limit,
    RATE_LIMITS.mediaComplete.windowMs,
  );
  if (limited) return limited;

  if (!isR2Configured()) {
    return NextResponse.json(
      {
        error:
          "Object storage is not configured yet. Add R2 credentials to .env.local.",
        code: "r2_not_configured",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  const filename =
    typeof raw.filename === "string" ? raw.filename : "";
  const declaredType =
    typeof raw.contentType === "string" ? raw.contentType : "";
  const resolvedType = resolveUploadContentType({
    filename,
    contentType: declaredType,
  });

  if (!resolvedType) {
    console.warn("[api.media.complete] unsupported content type", {
      userId,
      filename,
      declaredType,
      key: typeof raw.key === "string" ? raw.key : null,
    });
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Use JPEG, PNG, WebP, HEIC, MP4, MOV, or WebM.",
        code: "unsupported_type",
        filename,
        declaredType: declaredType || null,
      },
      { status: 400 },
    );
  }

  const parsed = completeMediaSchema.safeParse({
    ...raw,
    filename,
    contentType: resolvedType,
  });
  if (!parsed.success) {
    console.warn("[api.media.complete] invalid complete request", {
      userId,
      filename,
      declaredType,
      resolvedType,
      details: parsed.error.flatten(),
    });
    return NextResponse.json(
      {
        error: "Invalid complete request",
        code: "validation",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { key, contentType, size: declaredSize } = parsed.data;

  if (!isTempKey(key)) {
    return NextResponse.json(
      { error: "Upload key must use the temp/ prefix." },
      { status: 400 },
    );
  }

  // Ensure the key belongs to this user: temp/{userId}/...
  const expectedPrefix = `temp/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: "Upload key does not belong to the authenticated user." },
      { status: 403 },
    );
  }

  try {
    const head = await headObjectMeta(key);
    if (!head) {
      return NextResponse.json(
        {
          error:
            "Uploaded object was not found in storage. Try uploading again.",
        },
        { status: 400 },
      );
    }

    // Trust R2 ContentLength for quotas and stored byte_size — never client size alone.
    const byteSize = head.contentLength;
    if (byteSize <= 0) {
      return NextResponse.json(
        { error: "Uploaded object is empty. Try uploading again." },
        { status: 400 },
      );
    }

    const maxBytes = maxBytesForContentType(contentType);
    if (byteSize > maxBytes) {
      return NextResponse.json(
        {
          error: `File is too large. Max size is ${Math.round(maxBytes / (1024 * 1024))} MB for this type.`,
          code: "file_too_large",
          byteSize,
          maxBytes,
        },
        { status: 400 },
      );
    }

    // Soft check: large mismatch suggests a tampered declare — still enforce real size.
    if (
      declaredSize > 0 &&
      Math.abs(declaredSize - byteSize) > Math.max(64 * 1024, declaredSize * 0.05)
    ) {
      console.warn("[api.media.complete] declared size mismatch", {
        key,
        declaredSize,
        byteSize,
        userId,
      });
    }

    await assertUploadWithinStorageQuota(userId, byteSize);

    await ensureAppUser(userId);

    const mediaId = nanoid();
    const originalsKey = tempKeyToOriginalsKey(key);
    const moved = await promoteTempToOriginals(key, originalsKey);
    const now = new Date();
    const mediaKind = mediaTypeFromContentType(contentType);

    const db = getDb();

    // SAFETY: pending_moderation + pending only — never ready/clean on upload.
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
      source: "api.media.complete",
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
        declaredType: declaredType || null,
        originalFilename: filename,
        r2ContentType: head.contentType ?? null,
      },
      createdAt: now,
    });

    // SAFETY: moderation job is required — retrying enqueue is intentional.
    // If this throws after retries, media stays pending_moderation (not visible).
    // Ops can re-enqueue via admin or a sweeper; do not mark clean here.
    let job;
    try {
      job = await enqueueModerationJob({
        mediaId,
        originalKey: moved.toKey,
        contentType,
        userId,
        extra: {
          source: "api.media.complete",
          declaredType: declaredType || null,
          filename,
        },
      });
    } catch (enqueueError) {
      logUploadFailed(
        {
          mediaId: row.id,
          userId,
          stage: "enqueue_moderation",
        },
        enqueueError,
      );
      throw enqueueError;
    }

    console.info("[api.media.complete] upload recorded", {
      mediaId: row.id,
      userId,
      key: moved.toKey,
      contentType,
      declaredType: declaredType || null,
      filename,
      byteSize,
      jobId: job.id,
    });

    logUploadCompleted({
      mediaId: row.id,
      jobId: job.id,
      userId,
      status: row.status,
      moderationStatus: row.moderationStatus,
      byteSize,
      type: mediaKind,
    });

    // After bytes are counted, check 80% / 100% storage thresholds (deduped).
    const { queueStorageThresholdCheck } = await import(
      "@/lib/email/lifecycle"
    );
    queueStorageThresholdCheck(userId);

    return NextResponse.json({
      mediaId: row.id,
      jobId: job.id,
      status: row.status,
      moderationStatus: row.moderationStatus,
      message:
        "Upload received. Your file is being checked for safety before it can appear in the library.",
    });
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      const { queueStorageThresholdCheck } = await import(
        "@/lib/email/lifecycle"
      );
      queueStorageThresholdCheck(userId);

      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          usedBytes: error.usedBytes,
          limitBytes: error.limitBytes,
          remainingBytes: error.remainingBytes,
        },
        { status: 403 },
      );
    }
    logUploadFailed({ userId, stage: "complete" }, error);
    return NextResponse.json(
      {
        error:
          "We couldn’t finish saving your upload. Please try again — if the file already uploaded, wait a moment and refresh.",
        code: "internal",
      },
      { status: 500 },
    );
  }
}
