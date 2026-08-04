import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { assertEmergencyLegacyReadAccess } from "@/lib/emergency-access";
import { getLegacySecureItemForUser, LegacyError } from "@/lib/legacy";
import { serializeLegacySecureItem } from "@/lib/legacy/serialize";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  logSensitiveAccess,
  requireSensitiveStepUp,
} from "@/lib/security/sensitive-access";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { ensureAppUser } from "@/lib/users";

type RouteContext = {
  params: Promise<{ ownerUserId: string; id: string }>;
};

const bodySchema = z.object({
  confirmed: z.boolean().optional(),
});

/**
 * POST /api/legacy/granted/[ownerUserId]/secure-items/[id]/reveal
 */
export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { ownerUserId, id } = await context.params;

  const limited = enforceRateLimit(
    `legacy-granted-reveal:${userId}`,
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
    await ensureAppUser(userId);
    await assertEmergencyLegacyReadAccess(ownerUserId, userId);

    const item = await getLegacySecureItemForUser(id, ownerUserId);
    if (!item) {
      throw new LegacyError("Secure item not found.", { code: "not_found" });
    }

    await logSensitiveAccess({
      userId,
      action: "legacy.granted.secure_item.reveal",
      targetType: "legacy_secure_item",
      targetId: id,
      metadata: {
        ownerUserId,
        itemType: item.itemType,
        stepUpMethod: stepUp.method,
      },
    });

    return NextResponse.json({
      secureItem: serializeLegacySecureItem(item, null, {
        includeSensitiveFields: true,
      }),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to reveal secure item");
  }
}
