import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { LEGACY_SECURE_ITEM_TYPES } from "@/lib/db/schema";
import {
  deleteLegacySecureItem,
  updateLegacySecureItem,
} from "@/lib/legacy";
import { serializeLegacySecureItem } from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  itemType: z.enum(LEGACY_SECURE_ITEM_TYPES).optional(),
  content: z.string().min(1).max(50000).optional(),
  relatedDocumentId: z.string().min(1).max(64).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `legacy-secure-patch:${userId}`,
    RATE_LIMITS.documentsMutate.limit,
    RATE_LIMITS.documentsMutate.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid update", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const row = await updateLegacySecureItem(id, userId, parsed.data);
    return NextResponse.json({
      secureItem: serializeLegacySecureItem(row, null, {
        includeSensitiveFields: Boolean(parsed.data.content),
      }),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update secure item");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  try {
    await deleteLegacySecureItem(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to delete secure item");
  }
}
