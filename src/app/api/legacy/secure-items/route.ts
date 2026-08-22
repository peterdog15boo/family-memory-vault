import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { LEGACY_SECURE_ITEM_TYPES } from "@/lib/db/schema";
import { listPrivateDocuments } from "@/lib/documents";
import {
  createLegacySecureItem,
  listLegacySecureItems,
} from "@/lib/legacy";
import { serializeLegacySecureItem } from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

const createSchema = z.object({
  label: z.string().min(1).max(200),
  itemType: z.enum(LEGACY_SECURE_ITEM_TYPES).optional(),
  content: z.string().min(1).max(50000),
  relatedDocumentId: z.string().min(1).max(64).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

export async function GET() {
  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  try {
    const [rows, documents] = await Promise.all([
      listLegacySecureItems(userId),
      listPrivateDocuments(userId, { limit: 200 }),
    ]);
    const docTitleById = new Map(documents.map((d) => [d.id, d.title]));
    return NextResponse.json({
      secureItems: rows.map((item) =>
        serializeLegacySecureItem(
          item,
          item.relatedDocumentId
            ? docTitleById.get(item.relatedDocumentId) ?? null
            : null,
          { includeSensitiveFields: false },
        ),
      ),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to list secure items");
  }
}

export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-secure:${userId}`,
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
    return apiError("Invalid secure item", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const row = await createLegacySecureItem({
      userId,
      ...parsed.data,
    });
    return NextResponse.json({
      secureItem: serializeLegacySecureItem(row, null, {
        includeSensitiveFields: true,
      }),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to create secure item");
  }
}
