import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import {
  createPrivateDocumentDownloadUrl,
  getPrivateDocumentForUser,
} from "@/lib/documents";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { logPrivateDocumentAccessDenied } from "@/lib/observability/events";
import {
  logSensitiveAccess,
  requireSensitiveStepUp,
} from "@/lib/security/sensitive-access";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { isR2Configured } from "@/lib/upload/constants";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  purpose: z.enum(["document", "thumbnail"]).default("document"),
  confirmed: z.boolean().optional(),
});

/**
 * POST /api/documents/[id]/download-url
 * Short-lived signed GET for the owner’s file or thumbnail.
 */
export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `documents-download:${userId}`,
    RATE_LIMITS.documentsDownload.limit,
    RATE_LIMITS.documentsDownload.windowMs,
  );
  if (limited) return limited;

  if (!isR2Configured()) {
    return apiError(
      "Object storage is not configured yet. Add R2 credentials to .env.local.",
      { status: 503, code: "r2_not_configured" },
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const doc = await getPrivateDocumentForUser(id, userId);
    if (!doc) {
      logPrivateDocumentAccessDenied({
        userId,
        documentId: id,
        reason: "not_found",
      });
      return apiError("Document not found.", { status: 404, code: "not_found" });
    }

    const purpose = parsed.data.purpose;
    let documentStepUpMethod: "reverification" | "explicit_confirm" | null =
      null;

    if (purpose === "document") {
      const stepUp = await requireSensitiveStepUp({
        allowExplicitConfirm: true,
        confirmed: parsed.data.confirmed === true,
      });
      if (!stepUp.ok) return stepUp.response;
      documentStepUpMethod = stepUp.method;
    }

    if (purpose === "thumbnail") {
      if (!doc.thumbnailKey) {
        return apiError("No preview available for this document.", {
          status: 404,
          code: "not_found",
        });
      }
      const signed = await createPrivateDocumentDownloadUrl({
        userId,
        key: doc.thumbnailKey,
        documentId: doc.id,
        purpose: "thumbnail",
      });
      await logSensitiveAccess({
        userId,
        action: "private_document.thumbnail_url",
        targetType: "private_document",
        targetId: doc.id,
        metadata: { purpose: "thumbnail" },
      });
      return NextResponse.json({
        url: signed.url,
        expiresAt: signed.expiresAt,
        expiresIn: signed.expiresIn,
        purpose,
      });
    }

    const signed = await createPrivateDocumentDownloadUrl({
      userId,
      key: doc.storageKey,
      documentId: doc.id,
      purpose: "document",
      filename: doc.originalFilename,
    });

    await logSensitiveAccess({
      userId,
      action: "private_document.download_url",
      targetType: "private_document",
      targetId: doc.id,
      metadata: {
        purpose: "document",
        contentType: doc.contentType,
        stepUpMethod: documentStepUpMethod,
      },
    });

    return NextResponse.json({
      url: signed.url,
      expiresAt: signed.expiresAt,
      expiresIn: signed.expiresIn,
      purpose,
      filename: doc.originalFilename,
      contentType: doc.contentType,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to issue download URL");
  }
}
