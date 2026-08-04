import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import {
  LEGACY_VIDEO_MAX_BYTES,
  getLegacyVideoUploadUrl,
} from "@/lib/legacy/video-storage";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { isR2Configured } from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";

const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(3).max(120),
  size: z.number().int().positive().max(LEGACY_VIDEO_MAX_BYTES),
});

/**
 * POST /api/legacy/videos/upload-url
 * Short-lived PUT under private-legacy-videos-temp/{userId}/.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-videos-upload-url:${userId}`,
    RATE_LIMITS.legacyVideosUploadUrl.limit,
    RATE_LIMITS.legacyVideosUploadUrl.windowMs,
  );
  if (limited) return limited;

  if (!isR2Configured()) {
    return apiError(
      "Object storage is not configured yet. Add R2 credentials to .env.local.",
      { status: 503, code: "r2_not_configured" },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = uploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid upload request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    await ensureAppUser(userId);
    await assertUploadWithinStorageQuota(userId, parsed.data.size);
    const upload = await getLegacyVideoUploadUrl({
      userId,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.size,
    });

    return NextResponse.json({
      uploadUrl: upload.url,
      key: upload.key,
      expiresAt: upload.expiresAt,
      expiresIn: upload.expiresIn,
      contentType: upload.contentType,
      maxBytes: upload.maxBytes,
    });
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      return apiError(error.message, {
        status: 403,
        code: "storage_quota_exceeded",
      });
    }
    return apiErrorFromUnknown(error, "Failed to issue legacy video upload URL");
  }
}
