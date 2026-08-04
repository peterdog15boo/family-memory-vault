import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listPrivateDocuments } from "@/lib/documents";
import { getLegacySecureItemForUser, LegacyError } from "@/lib/legacy";
import { serializeLegacySecureItem } from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  logSensitiveAccess,
  requireSensitiveStepUp,
} from "@/lib/security/sensitive-access";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  confirmed: z.boolean().optional(),
});

/**
 * POST /api/legacy/secure-items/[id]/reveal
 * Returns sensitive content after step-up verification.
 */
export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `legacy-secure-reveal:${userId}`,
    RATE_LIMITS.documentsDownload.limit,
    RATE_LIMITS.documentsDownload.windowMs,
  );
  if (limited) return limited;

  let confirmed = false;
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    confirmed = parsed.success ? parsed.data.confirmed === true : false;
  } catch {
    confirmed = false;
  }

  const stepUp = await requireSensitiveStepUp({
    allowExplicitConfirm: true,
    confirmed,
  });
  if (!stepUp.ok) return stepUp.response;

  try {
    const item = await getLegacySecureItemForUser(id, userId);
    if (!item) {
      throw new LegacyError("Secure item not found.", { code: "not_found" });
    }
    let relatedTitle: string | null = null;
    if (item.relatedDocumentId) {
      const docs = await listPrivateDocuments(userId, { limit: 200 });
      relatedTitle =
        docs.find((d) => d.id === item.relatedDocumentId)?.title ?? null;
    }

    await logSensitiveAccess({
      userId,
      action: "legacy.secure_item.reveal",
      targetType: "legacy_secure_item",
      targetId: id,
      metadata: {
        itemType: item.itemType,
        stepUpMethod: stepUp.method,
      },
    });

    return NextResponse.json({
      secureItem: serializeLegacySecureItem(item, relatedTitle, {
        includeSensitiveFields: true,
      }),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to reveal secure item");
  }
}
