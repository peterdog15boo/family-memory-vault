import { NextResponse } from "next/server";
import { z } from "zod";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import {
  PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES,
  PRIVATE_DOCUMENT_MAX_BYTES,
} from "@/lib/documents/constants";
import { createPrivateDocumentUploadUrl } from "@/lib/documents";
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
  contentType: z.enum(PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES),
  size: z.number().int().positive().max(PRIVATE_DOCUMENT_MAX_BYTES),
});

/**
 * POST /api/documents/upload-url
 * Short-lived PUT URL under private-documents-temp/{userId}/.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `documents-upload-url:${userId}`,
    RATE_LIMITS.documentsUploadUrl.limit,
    RATE_LIMITS.documentsUploadUrl.windowMs,
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
    const upload = await createPrivateDocumentUploadUrl({
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
    return apiErrorFromUnknown(error, "Failed to issue document upload URL");
  }
}
