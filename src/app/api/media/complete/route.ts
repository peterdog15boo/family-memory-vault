import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  StorageQuotaError,
  finalizeUploadedMedia,
} from "@/lib/media/import/ingest";
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
  resolveUploadContentType,
} from "@/lib/upload/constants";
import { mediaTypeFromContentType } from "@/lib/upload/constants";
import { z } from "zod";

const completeBodySchema = completeMediaSchema.extend({
  attachMemoryId: z.string().min(1).max(64).optional().nullable(),
  importProvider: z
    .enum([
      "device",
      "export_package",
      "google_takeout",
      "google_drive",
      "dropbox",
      "facebook",
      "instagram",
      "tiktok",
    ])
    .optional()
    .nullable(),
  importExternalId: z.string().min(1).max(512).optional().nullable(),
});

/**
 * POST /api/media/complete
 *
 * SAFETY PIPELINE (entry point after browser PUT to R2):
 * 1. Validate the temp/ object belongs to the signed-in user
 * 2. HEAD the object — quota + per-type max use real ContentLength
 * 3. Promote temp/ → originals/ (still untrusted)
 * 4. Insert media with status = pending_moderation
 * 5. Enqueue moderation job
 * 6. Optional pendingMemoryId for auto-attach after clean/ready
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

  const parsed = completeBodySchema.safeParse({
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

  const {
    key,
    contentType,
    size: declaredSize,
    attachMemoryId,
    importProvider,
    importExternalId,
  } = parsed.data;

  try {
    const result = await finalizeUploadedMedia({
      userId,
      key,
      filename,
      contentType,
      declaredSize,
      attachMemoryId: attachMemoryId ?? null,
      importProvider: importProvider ?? "device",
      importExternalId: importExternalId ?? null,
      source: "api.media.complete",
    });

    const mediaKind = mediaTypeFromContentType(contentType);

    console.info("[api.media.complete] upload recorded", {
      mediaId: result.mediaId,
      userId,
      contentType,
      filename,
      jobId: result.jobId,
      deduped: result.deduped,
      pendingMemoryId: result.pendingMemoryId,
    });

    logUploadCompleted({
      mediaId: result.mediaId,
      jobId: result.jobId ?? undefined,
      userId,
      status: result.status,
      moderationStatus: result.moderationStatus,
      type: mediaKind,
    });

    return NextResponse.json({
      mediaId: result.mediaId,
      jobId: result.jobId,
      status: result.status,
      moderationStatus: result.moderationStatus,
      deduped: result.deduped,
      pendingMemoryId: result.pendingMemoryId,
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

    const message =
      error instanceof Error ? error.message : "Could not finish saving.";
    if (
      message.includes("Memory not found") ||
      message.includes("temp/") ||
      message.includes("does not belong")
    ) {
      return NextResponse.json({ error: message, code: "validation" }, { status: 400 });
    }
    if (
      message.includes("not found in storage") ||
      message.includes("empty")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if ((error as { code?: string }).code === "file_too_large") {
      return NextResponse.json(
        { error: message, code: "file_too_large" },
        { status: 400 },
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
