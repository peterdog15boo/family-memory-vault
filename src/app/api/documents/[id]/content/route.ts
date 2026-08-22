import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import {
  getPrivateDocumentForUser,
  getPrivateDocumentObjectStream,
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
  confirmed: z.boolean().optional(),
});

function safeContentDispositionFilename(filename: string): string {
  return filename.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
}

/**
 * POST /api/documents/[id]/content
 * Same-origin stream of the private document for in-app viewing.
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

    const stepUp = await requireSensitiveStepUp({
      allowExplicitConfirm: true,
      confirmed: parsed.data.confirmed === true,
    });
    if (!stepUp.ok) return stepUp.response;

    const object = await getPrivateDocumentObjectStream({
      userId,
      key: doc.storageKey,
    });

    await logSensitiveAccess({
      userId,
      action: "private_document.view_content",
      targetType: "private_document",
      targetId: doc.id,
      metadata: {
        purpose: "view",
        contentType: doc.contentType,
        stepUpMethod: stepUp.method,
      },
    });

    const filename = safeContentDispositionFilename(doc.originalFilename);
    const headers = new Headers({
      "Content-Type": object.contentType || doc.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Document-Filename": encodeURIComponent(doc.originalFilename),
      "X-Document-Content-Type": doc.contentType,
    });
    if (typeof object.contentLength === "number") {
      headers.set("Content-Length", String(object.contentLength));
    }

    return new NextResponse(object.body, { status: 200, headers });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load document content");
  }
}
