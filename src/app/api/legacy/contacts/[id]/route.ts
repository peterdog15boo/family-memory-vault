import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { LEGACY_CONTACT_CATEGORIES } from "@/lib/db/schema";
import {
  deleteLegacyContact,
  updateLegacyContact,
} from "@/lib/legacy";
import { serializeLegacyContact } from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  relationship: z.string().max(200).optional().nullable(),
  category: z.enum(LEGACY_CONTACT_CATEGORIES).optional(),
  phone: z.string().max(80).optional().nullable(),
  email: z.string().max(320).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `legacy-contacts-patch:${userId}`,
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
    const row = await updateLegacyContact(id, userId, parsed.data);
    return NextResponse.json({ contact: serializeLegacyContact(row) });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update contact");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  try {
    await deleteLegacyContact(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to delete contact");
  }
}
