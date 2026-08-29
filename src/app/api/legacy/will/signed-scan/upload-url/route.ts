import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import { createPrivateDocumentUploadUrl } from "@/lib/documents";
import { PRIVATE_DOCUMENT_MAX_BYTES } from "@/lib/documents/constants";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  getOwnedWillDraft,
  WILL_SIGNED_SCAN_CONTENT_TYPES,
  isWillSignedScanContentType,
} from "@/lib/will-planner/server";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { isR2Configured } from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const schema = z.object({
  draftId: z.string().min(1).max(64),
  filename: z.string().min(1).max(255),
  contentType: z.enum(WILL_SIGNED_SCAN_CONTENT_TYPES),
  size: z.number().int().positive().max(PRIVATE_DOCUMENT_MAX_BYTES),
});

/**
 * POST /api/legacy/will/signed-scan/upload-url
 * Presign PUT under private-documents-temp/{userId}/ only.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `will-signed-scan-url:${userId}`,
    RATE_LIMITS.willPlannerMutate.limit,
    RATE_LIMITS.willPlannerMutate.windowMs,
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid signed-scan upload request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  if (!isWillSignedScanContentType(parsed.data.contentType)) {
    return apiError("Signed will scans must be PDF, JPEG, or PNG.", {
      status: 400,
      code: "validation",
    });
  }

  try {
    await ensureAppUser(userId);
    const draft = await getOwnedWillDraft(userId, parsed.data.draftId);
    if (!draft || draft.status === "archived") {
      return apiError("Will draft not found", {
        status: 404,
        code: "not_found",
      });
    }

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
    return apiErrorFromUnknown(error, "Failed to issue signed-scan upload URL");
  }
}
