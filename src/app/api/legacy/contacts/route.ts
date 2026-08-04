import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { LEGACY_CONTACT_CATEGORIES } from "@/lib/db/schema";
import {
  createLegacyContact,
  listLegacyContacts,
} from "@/lib/legacy";
import { serializeLegacyContact } from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  relationship: z.string().max(200).optional().nullable(),
  category: z.enum(LEGACY_CONTACT_CATEGORIES).optional(),
  phone: z.string().max(80).optional().nullable(),
  email: z.string().max(320).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  try {
    const rows = await listLegacyContacts(userId);
    return NextResponse.json({
      contacts: rows.map(serializeLegacyContact),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to list contacts");
  }
}

export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-contacts:${userId}`,
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid contact", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const row = await createLegacyContact({
      userId,
      ...parsed.data,
    });
    return NextResponse.json({ contact: serializeLegacyContact(row) });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to create contact");
  }
}
