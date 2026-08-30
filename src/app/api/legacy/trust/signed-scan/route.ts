import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import { PRIVATE_DOCUMENT_MAX_BYTES } from "@/lib/documents/constants";
import { serializePrivateDocument } from "@/lib/documents/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  TRUST_SIGNED_SCAN_CONTENT_TYPES,
  completeTrustSignedScanUpload,
  discardTrustSignedScanTempUpload,
  getOwnedTrustDraft,
  removeTrustSignedScan,
  serializeTrustDraft,
} from "@/lib/trust-planner/server";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { isR2Configured } from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const completeSchema = z.object({
  draftId: z.string().min(1).max(64),
  tempKey: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.enum(TRUST_SIGNED_SCAN_CONTENT_TYPES),
  size: z.number().int().positive().max(PRIVATE_DOCUMENT_MAX_BYTES),
});

const deleteSchema = z.object({
  draftId: z.string().min(1).max(64),
  confirm: z.literal(true),
});

/**
 * POST /api/legacy/trust/signed-scan — promote temp upload into Wills / Estate.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `trust-signed-scan-complete:${userId}`,
    RATE_LIMITS.trustPlannerMutate.limit,
    RATE_LIMITS.trustPlannerMutate.windowMs,
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

  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid signed-scan complete request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  try {
    await ensureAppUser(userId);
    await assertUploadWithinStorageQuota(userId, input.size);

    const { draftScan, document } = await completeTrustSignedScanUpload({
      userId,
      draftId: input.draftId,
      tempKey: input.tempKey,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.size,
    });

    const draft = await getOwnedTrustDraft(userId, input.draftId);
    return NextResponse.json({
      signedScan: draftScan,
      document: serializePrivateDocument(document),
      draft: draft ? serializeTrustDraft(draft) : null,
    });
  } catch (error) {
    try {
      await discardTrustSignedScanTempUpload({
        userId,
        tempKey: input.tempKey,
      });
    } catch {
      // ignore
    }
    if (error instanceof StorageQuotaError) {
      return apiError(error.message, {
        status: 403,
        code: "storage_quota_exceeded",
      });
    }
    const message =
      error instanceof Error ? error.message : "Failed to save signed scan";
    if (message.includes("not found")) {
      return apiError(message, { status: 404, code: "not_found" });
    }
    return apiErrorFromUnknown(error, "Failed to save signed scan");
  }
}

/**
 * DELETE /api/legacy/trust/signed-scan — remove archived scan (confirm required).
 * Does not clear checklist checks.
 */
export async function DELETE(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `trust-signed-scan-delete:${userId}`,
    RATE_LIMITS.trustPlannerMutate.limit,
    RATE_LIMITS.trustPlannerMutate.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Confirm deletion of the signed-trust scan.", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    await removeTrustSignedScan({
      userId,
      draftId: parsed.data.draftId,
    });
    const draft = await getOwnedTrustDraft(userId, parsed.data.draftId);
    return NextResponse.json({
      ok: true,
      draft: draft ? serializeTrustDraft(draft) : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete signed scan";
    if (message.includes("not found")) {
      return apiError(message, { status: 404, code: "not_found" });
    }
    return apiErrorFromUnknown(error, "Failed to delete signed scan");
  }
}
