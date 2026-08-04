import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import { buildTempUploadKey, getUploadUrl } from "@/lib/r2";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { LogEvents } from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";
import {
  isR2Configured,
  maxBytesForContentType,
  presignRequestSchema,
  resolveUploadContentType,
} from "@/lib/upload/constants";

/**
 * POST /api/upload-url
 *
 * Authenticated. Returns a short-lived presigned PUT URL for R2.
 * Forces key pattern: temp/{userId}/{year}/{month}/{nanoid}.{ext}
 * Rejects when the file would exceed the user's plan storage quota.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `upload-url:${userId}`,
    RATE_LIMITS.uploadUrl.limit,
    RATE_LIMITS.uploadUrl.windowMs,
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
    console.warn("[api.upload-url] unsupported content type", {
      userId,
      filename,
      declaredType,
      size: raw.size,
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

  const parsed = presignRequestSchema.safeParse({
    ...raw,
    filename,
    contentType: resolvedType,
  });
  if (!parsed.success) {
    console.warn("[api.upload-url] invalid upload request", {
      userId,
      filename,
      declaredType,
      resolvedType,
      details: parsed.error.flatten(),
    });
    return NextResponse.json(
      {
        error: "Invalid upload request",
        code: "validation",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { contentType, size } = parsed.data;
  const maxBytes = maxBytesForContentType(contentType);
  if (size > maxBytes) {
    return NextResponse.json(
      {
        error: `File is too large. Max size is ${Math.round(maxBytes / (1024 * 1024))} MB for this type.`,
      },
      { status: 400 },
    );
  }

  try {
    const quota = await assertUploadWithinStorageQuota(userId, size);
    const key = buildTempUploadKey(userId, filename);
    const upload = await getUploadUrl(key, contentType);

    logger.info(LogEvents.uploadUrlIssued, {
      userId,
      contentType,
      declaredType: declaredType || null,
      size,
      filename,
      key,
      keyPrefix: key.split("/").slice(0, 2).join("/"),
      expiresIn: upload.expiresIn,
    });

    return NextResponse.json({
      uploadUrl: upload.url,
      /** Same-origin fallback when R2 CORS blocks browser PUT (LAN / iPhone). */
      proxyPutUrl: `/api/upload/put?key=${encodeURIComponent(key)}`,
      key: upload.key,
      expiresAt: upload.expiresAt,
      expiresIn: upload.expiresIn,
      storage: {
        usedBytes: quota.usedBytes,
        limitBytes: quota.limitBytes,
        remainingBytes: quota.remainingBytes,
        label: quota.label,
      },
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
    console.error("upload-url failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create upload URL",
      },
      { status: 500 },
    );
  }
}
