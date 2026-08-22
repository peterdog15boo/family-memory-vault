import { nanoid } from "nanoid";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import {
  createPrivateDocument,
  discardPrivateDocumentTempUpload,
  generatePrivateDocumentThumbnail,
  listPrivateDocuments,
  promotePrivateDocumentTempToPermanent,
} from "@/lib/documents";
import {
  PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES,
  PRIVATE_DOCUMENT_MAX_BYTES,
} from "@/lib/documents/constants";
import {
  buildPrivateDocumentThumbnailKey,
  deletePrivateDocumentObjects,
} from "@/lib/documents/storage";
import { serializePrivateDocument } from "@/lib/documents/serialize";
import { parseOptionalDocumentDate } from "@/lib/documents/dates";
import { DOCUMENT_REMINDER_KINDS } from "@/lib/documents/types";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { isR2Configured } from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";

const listQuerySchema = z.object({
  categoryId: z.string().min(1).max(64).optional(),
  query: z.string().max(200).optional(),
  view: z.enum(["all", "important", "recent", "reminders"]).optional(),
  importantOnly: z
    .enum(["1", "true", "0", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const optionalDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.literal(""),
    z.null(),
  ])
  .optional();

const completeSchema = z.object({
  tempKey: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.enum(PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES),
  size: z.number().int().positive().max(PRIVATE_DOCUMENT_MAX_BYTES),
  categoryId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  notes: z.string().max(20000).optional().nullable(),
  tags: z.array(z.string().min(1).max(64)).max(32).optional(),
  importantFlag: z.boolean().optional(),
  documentDate: optionalDate,
  reminderAt: optionalDate,
  reminderKind: z.enum(DOCUMENT_REMINDER_KINDS).optional().nullable(),
});

/**
 * GET /api/documents — list owner-scoped private documents.
 */
export async function GET(request: Request) {
  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `documents-list:${userId}`,
    RATE_LIMITS.documentsMutate.limit,
    RATE_LIMITS.documentsMutate.windowMs,
  );
  if (limited) return limited;

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    categoryId: url.searchParams.get("categoryId") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
    view: url.searchParams.get("view") ?? undefined,
    importantOnly: url.searchParams.get("importantOnly") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return apiError("Invalid query", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const rows = await listPrivateDocuments(userId, {
      categoryId: parsed.data.categoryId,
      query: parsed.data.query,
      view: parsed.data.view,
      importantOnly: parsed.data.importantOnly,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return NextResponse.json({
      items: rows.map((row) => serializePrivateDocument(row)),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to list documents");
  }
}

/**
 * POST /api/documents — finalize a private document upload (promote + DB row).
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `documents-complete:${userId}`,
    RATE_LIMITS.documentsComplete.limit,
    RATE_LIMITS.documentsComplete.windowMs,
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
    return apiError("Invalid document request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  const documentId = nanoid();
  let promotedKey: string | null = null;
  let thumbnailKey: string | null = null;

  try {
    await ensureAppUser(userId);
    await assertUploadWithinStorageQuota(userId, input.size);

    const promoted = await promotePrivateDocumentTempToPermanent({
      userId,
      documentId,
      tempKey: input.tempKey,
      filename: input.filename,
      expectedContentType: input.contentType,
      expectedSizeBytes: input.size,
    });
    promotedKey = promoted.toKey;

    const thumb = await generatePrivateDocumentThumbnail({
      userId,
      documentId,
      storageKey: promoted.toKey,
      contentType: input.contentType,
    });
    thumbnailKey = thumb.thumbnailKey;

    const row = await createPrivateDocument({
      id: documentId,
      userId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      notes: input.notes,
      originalFilename: input.filename,
      contentType: input.contentType,
      sizeBytes: promoted.sizeBytes,
      storageKey: promoted.toKey,
      thumbnailKey: thumb.thumbnailKey,
      tags: input.tags,
      importantFlag: input.importantFlag,
      documentDate: parseOptionalDocumentDate(input.documentDate ?? null) ?? null,
      reminderAt: parseOptionalDocumentDate(input.reminderAt ?? null) ?? null,
      reminderKind: input.reminderKind ?? null,
    });

    return NextResponse.json({
      document: serializePrivateDocument(row),
    });
  } catch (error) {
    if (promotedKey) {
      try {
        await deletePrivateDocumentObjects({
          userId,
          documentId,
          storageKey: promotedKey,
          thumbnailKey:
            thumbnailKey ??
            buildPrivateDocumentThumbnailKey({ userId, documentId }),
        });
      } catch {
        // best-effort cleanup
      }
    } else {
      try {
        await discardPrivateDocumentTempUpload({
          userId,
          tempKey: input.tempKey,
        });
      } catch {
        // best-effort
      }
    }

    if (error instanceof StorageQuotaError) {
      return apiError(error.message, {
        status: 403,
        code: "storage_quota_exceeded",
      });
    }
    return apiErrorFromUnknown(error, "Failed to save private document");
  }
}
