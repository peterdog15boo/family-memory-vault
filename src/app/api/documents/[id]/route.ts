import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  deletePrivateDocumentWithStorage,
  getPrivateDocumentWithCategory,
  updatePrivateDocument,
} from "@/lib/documents";
import { parseOptionalDocumentDate } from "@/lib/documents/dates";
import { serializePrivateDocument } from "@/lib/documents/serialize";
import { DOCUMENT_REMINDER_KINDS } from "@/lib/documents/types";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const optionalDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.literal(""),
    z.null(),
  ])
  .optional();

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
  categoryId: z.string().min(1).max(64).optional(),
  tags: z.array(z.string().min(1).max(64)).max(32).optional(),
  importantFlag: z.boolean().optional(),
  documentDate: optionalDate,
  reminderAt: optionalDate,
  reminderKind: z.enum(DOCUMENT_REMINDER_KINDS).optional().nullable(),
});

/**
 * GET /api/documents/[id]
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  try {
    const row = await getPrivateDocumentWithCategory(id, userId);
    if (!row) {
      return apiError("Document not found.", { status: 404, code: "not_found" });
    }
    return NextResponse.json({
      document: serializePrivateDocument(row, row.category),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load document");
  }
}

/**
 * PATCH /api/documents/[id] — edit metadata only.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `documents-patch:${userId}`,
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
    const row = await updatePrivateDocument(id, userId, {
      title: parsed.data.title,
      description: parsed.data.description,
      notes: parsed.data.notes,
      categoryId: parsed.data.categoryId,
      tags: parsed.data.tags,
      importantFlag: parsed.data.importantFlag,
      documentDate:
        parsed.data.documentDate === undefined
          ? undefined
          : parseOptionalDocumentDate(parsed.data.documentDate) ?? null,
      reminderAt:
        parsed.data.reminderAt === undefined
          ? undefined
          : parseOptionalDocumentDate(parsed.data.reminderAt) ?? null,
      reminderKind:
        parsed.data.reminderKind === undefined
          ? undefined
          : parsed.data.reminderKind,
    });
    return NextResponse.json({
      document: serializePrivateDocument(row),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update document");
  }
}

/**
 * DELETE /api/documents/[id]
 */
export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  const limited = enforceRateLimit(
    `documents-delete:${userId}`,
    RATE_LIMITS.documentsMutate.limit,
    RATE_LIMITS.documentsMutate.windowMs,
  );
  if (limited) return limited;

  try {
    await deletePrivateDocumentWithStorage(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to delete document");
  }
}
