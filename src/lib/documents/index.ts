/**
 * Private Documents — owner-scoped CRUD.
 *
 * Invariants:
 * - Every query filters by userId (never trust client category/document IDs alone).
 * - Documents are never joined into family gallery / shared media helpers.
 * - Deleting a category is blocked while documents remain (DB ON DELETE restrict).
 */

import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  documentCategories,
  privateDocuments,
  type DocumentCategory,
  type PrivateDocument,
} from "@/lib/db/schema";
import {
  DEFAULT_DOCUMENT_CATEGORY_DEFS,
  type BulkUpdatePrivateDocumentsInput,
  type CreateDocumentCategoryInput,
  type CreatePrivateDocumentInput,
  type ListPrivateDocumentsFilter,
  type UpdateDocumentCategoryInput,
  type UpdatePrivateDocumentInput,
} from "@/lib/documents/types";
import { deletePrivateDocumentObjects } from "@/lib/documents/storage";
import { R2_PREFIXES } from "@/lib/r2";
import type { DocumentReminderKind } from "@/lib/documents/types";
import { DOCUMENT_REMINDER_KINDS } from "@/lib/documents/types";

export {
  DEFAULT_DOCUMENT_CATEGORY_DEFS,
  PRIVATE_DOCUMENTS_SAFETY,
} from "@/lib/documents/types";
export type {
  BulkUpdatePrivateDocumentsInput,
  CreateDocumentCategoryInput,
  CreatePrivateDocumentInput,
  DefaultDocumentCategorySlug,
  DocumentCategoryDef,
  ListPrivateDocumentsFilter,
  PrivateDocumentListView,
  UpdateDocumentCategoryInput,
  UpdatePrivateDocumentInput,
} from "@/lib/documents/types";
export {
  PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES,
  PRIVATE_DOCUMENT_MAX_BYTES,
  type PrivateDocumentAllowedContentType,
} from "@/lib/documents/constants";
export {
  PRIVATE_DOCUMENT_DOWNLOAD_EXPIRES_IN_SECONDS,
  PRIVATE_DOCUMENT_DOWNLOAD_MAX_EXPIRES_IN_SECONDS,
  PRIVATE_DOCUMENT_UPLOAD_EXPIRES_IN_SECONDS,
  PrivateDocumentStorageError,
  assertAllowedPrivateDocumentUpload,
  assertPrivateDocumentKeyForUser,
  buildPrivateDocumentStorageKey,
  buildPrivateDocumentTempKey,
  buildPrivateDocumentThumbnailKey,
  canGeneratePrivateDocumentImagePreview,
  contentTypeForPrivateDocumentFilename,
  createPrivateDocumentDownloadUrl,
  createPrivateDocumentUploadUrl,
  deletePrivateDocumentObjects,
  discardPrivateDocumentTempUpload,
  generatePrivateDocumentThumbnail,
  getPrivateDocumentObjectStream,
  isAllowedPrivateDocumentContentType,
  isPrivateDocumentKeyForUser,
  isPrivateDocumentPermanentKey,
  isPrivateDocumentTempKey,
  promotePrivateDocumentTempToPermanent,
  replacePrivateDocumentFile,
} from "@/lib/documents/storage";

export class DocumentsError extends Error {
  readonly code?: "not_found" | "validation" | "conflict" | "forbidden";

  constructor(
    message: string,
    options?: { code?: DocumentsError["code"] },
  ) {
    super(message);
    this.name = "DocumentsError";
    this.code = options?.code;
  }
}

/* -------------------------------------------------------------------------- */
/* Slug / validation                                                          */
/* -------------------------------------------------------------------------- */

export function slugifyDocumentCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().slice(0, 64);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 32) break;
  }
  return out;
}

const REMINDER_KIND_SET = new Set<string>(DOCUMENT_REMINDER_KINDS);

function normalizeReminderKind(
  kind: DocumentReminderKind | null | undefined,
): DocumentReminderKind | null | undefined {
  if (kind === undefined) return undefined;
  if (kind === null) return null;
  if (!REMINDER_KIND_SET.has(kind)) {
    throw new DocumentsError("Invalid reminder kind.", { code: "validation" });
  }
  return kind;
}

/**
 * Resolve reminderAt + reminderKind together.
 * Clearing the date always clears the kind. Setting a date without a kind
 * defaults to "other".
 */
function resolveReminderFields(input: {
  reminderAt?: Date | null;
  reminderKind?: DocumentReminderKind | null;
  existingReminderAt?: Date | null;
  existingReminderKind?: DocumentReminderKind | null;
}): { reminderAt?: Date | null; reminderKind?: DocumentReminderKind | null } {
  const kind = normalizeReminderKind(input.reminderKind);
  if (input.reminderAt === null) {
    return { reminderAt: null, reminderKind: null };
  }
  if (input.reminderAt !== undefined) {
    return {
      reminderAt: input.reminderAt,
      reminderKind: kind === undefined ? (input.existingReminderKind ?? "other") : kind ?? "other",
    };
  }
  if (kind !== undefined) {
    if (kind === null) {
      return { reminderKind: null };
    }
    if (!input.existingReminderAt) {
      throw new DocumentsError(
        "Set a reminder date before choosing a reminder type.",
        { code: "validation" },
      );
    }
    return { reminderKind: kind };
  }
  return {};
}

function assertOwnedStorageKey(userId: string, storageKey: string): void {
  const prefix = `${R2_PREFIXES.privateDocuments}${userId}/`;
  if (!storageKey.startsWith(prefix)) {
    throw new DocumentsError(
      "Document storage key must be under the owner’s private-documents prefix.",
      { code: "validation" },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Ensure the standard default categories exist for this user.
 * Idempotent — safe to call on every Private Documents page load.
 */
export async function ensureDefaultDocumentCategories(
  userId: string,
): Promise<DocumentCategory[]> {
  const db = getDb();
  const existing = await db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.userId, userId));

  const bySlug = new Map(existing.map((row) => [row.slug, row]));
  const toInsert = DEFAULT_DOCUMENT_CATEGORY_DEFS.filter(
    (def) => !bySlug.has(def.slug),
  );

  if (toInsert.length > 0) {
    const now = new Date();
    await db.insert(documentCategories).values(
      toInsert.map((def) => ({
        id: nanoid(),
        userId,
        name: def.name,
        slug: def.slug,
        description: def.description,
        sortOrder: def.sortOrder,
        createdAt: now,
      })),
    );
  }

  return listDocumentCategories(userId);
}

export async function listDocumentCategories(
  userId: string,
): Promise<DocumentCategory[]> {
  const db = getDb();
  return db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.userId, userId))
    .orderBy(asc(documentCategories.sortOrder), asc(documentCategories.name));
}

export async function getDocumentCategoryForUser(
  categoryId: string,
  userId: string,
): Promise<DocumentCategory | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(documentCategories)
    .where(
      and(
        eq(documentCategories.id, categoryId),
        eq(documentCategories.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createDocumentCategory(
  input: CreateDocumentCategoryInput,
): Promise<DocumentCategory> {
  const name = input.name.trim();
  if (!name) {
    throw new DocumentsError("Category name is required.", { code: "validation" });
  }
  if (name.length > 120) {
    throw new DocumentsError("Category name is too long.", { code: "validation" });
  }

  const slug = (input.slug?.trim() || slugifyDocumentCategory(name)).slice(0, 80);
  if (!slug) {
    throw new DocumentsError("Category slug is required.", { code: "validation" });
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: documentCategories.id })
    .from(documentCategories)
    .where(
      and(
        eq(documentCategories.userId, input.userId),
        eq(documentCategories.slug, slug),
      ),
    )
    .limit(1);

  if (existing) {
    throw new DocumentsError("A category with that slug already exists.", {
      code: "conflict",
    });
  }

  const [row] = await db
    .insert(documentCategories)
    .values({
      id: nanoid(),
      userId: input.userId,
      name,
      slug,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 200,
      createdAt: new Date(),
    })
    .returning();

  if (!row) {
    throw new DocumentsError("Failed to create category.");
  }
  return row;
}

export async function updateDocumentCategory(
  categoryId: string,
  userId: string,
  patch: UpdateDocumentCategoryInput,
): Promise<DocumentCategory> {
  const existing = await getDocumentCategoryForUser(categoryId, userId);
  if (!existing) {
    throw new DocumentsError("Category not found.", { code: "not_found" });
  }

  const nextName = patch.name?.trim();
  if (nextName !== undefined && !nextName) {
    throw new DocumentsError("Category name cannot be empty.", {
      code: "validation",
    });
  }

  const db = getDb();
  const [row] = await db
    .update(documentCategories)
    .set({
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    })
    .where(
      and(
        eq(documentCategories.id, categoryId),
        eq(documentCategories.userId, userId),
      ),
    )
    .returning();

  if (!row) {
    throw new DocumentsError("Category not found.", { code: "not_found" });
  }
  return row;
}

/**
 * Delete an empty category owned by the user.
 * Fails if any documents still reference it.
 */
export async function deleteDocumentCategory(
  categoryId: string,
  userId: string,
): Promise<void> {
  const existing = await getDocumentCategoryForUser(categoryId, userId);
  if (!existing) {
    throw new DocumentsError("Category not found.", { code: "not_found" });
  }

  const db = getDb();
  const [doc] = await db
    .select({ id: privateDocuments.id })
    .from(privateDocuments)
    .where(
      and(
        eq(privateDocuments.userId, userId),
        eq(privateDocuments.categoryId, categoryId),
      ),
    )
    .limit(1);

  if (doc) {
    throw new DocumentsError(
      "Move or delete documents in this category before removing it.",
      { code: "conflict" },
    );
  }

  await db
    .delete(documentCategories)
    .where(
      and(
        eq(documentCategories.id, categoryId),
        eq(documentCategories.userId, userId),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

export async function createPrivateDocument(
  input: CreatePrivateDocumentInput,
): Promise<PrivateDocument> {
  const title = input.title.trim();
  if (!title) {
    throw new DocumentsError("Document title is required.", { code: "validation" });
  }
  if (title.length > 200) {
    throw new DocumentsError("Document title is too long.", { code: "validation" });
  }
  if (!input.originalFilename?.trim()) {
    throw new DocumentsError("Original filename is required.", {
      code: "validation",
    });
  }
  if (!input.contentType?.trim()) {
    throw new DocumentsError("Content type is required.", { code: "validation" });
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes < 0) {
    throw new DocumentsError("Invalid file size.", { code: "validation" });
  }

  assertOwnedStorageKey(input.userId, input.storageKey);

  const category = await getDocumentCategoryForUser(
    input.categoryId,
    input.userId,
  );
  if (!category) {
    throw new DocumentsError("Category not found.", { code: "not_found" });
  }

  if (input.thumbnailKey) {
    assertOwnedStorageKey(input.userId, input.thumbnailKey);
  }

  const reminder = resolveReminderFields({
    reminderAt:
      input.reminderAt === undefined ? undefined : input.reminderAt ?? null,
    reminderKind: input.reminderKind,
  });

  const now = new Date();
  const db = getDb();
  const [row] = await db
    .insert(privateDocuments)
    .values({
      id: input.id?.trim() || nanoid(),
      userId: input.userId,
      categoryId: input.categoryId,
      title,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      originalFilename: input.originalFilename.trim(),
      contentType: input.contentType.trim(),
      sizeBytes: Math.floor(input.sizeBytes),
      storageKey: input.storageKey,
      thumbnailKey: input.thumbnailKey ?? null,
      tags: cleanTags(input.tags),
      documentDate: input.documentDate ?? null,
      importantFlag: Boolean(input.importantFlag),
      reminderAt: reminder.reminderAt ?? null,
      reminderKind: reminder.reminderKind ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new DocumentsError("Failed to create document.");
  }
  return row;
}

export async function getPrivateDocumentForUser(
  documentId: string,
  userId: string,
): Promise<PrivateDocument | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(privateDocuments)
    .where(
      and(
        eq(privateDocuments.id, documentId),
        eq(privateDocuments.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listPrivateDocuments(
  userId: string,
  filter: ListPrivateDocumentsFilter = {},
): Promise<PrivateDocument[]> {
  const db = getDb();
  const limit = Math.min(Math.max(filter.limit ?? 48, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  const view = filter.view ?? "all";
  const conditions = [eq(privateDocuments.userId, userId)];

  if (filter.categoryId) {
    conditions.push(eq(privateDocuments.categoryId, filter.categoryId));
  }
  if (filter.importantOnly || view === "important") {
    conditions.push(eq(privateDocuments.importantFlag, true));
  }
  if (view === "recent") {
    const days = Math.min(Math.max(filter.recentDays ?? 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    conditions.push(gte(privateDocuments.createdAt, since));
  }
  if (view === "reminders") {
    // Include overdue + upcoming reminders (not only future dates).
    conditions.push(isNotNull(privateDocuments.reminderAt));
  }
  if (filter.tag?.trim()) {
    const tag = filter.tag.trim().toLowerCase();
    conditions.push(
      sql`${privateDocuments.tags} @> ${JSON.stringify([tag])}::jsonb`,
    );
  }
  if (filter.query?.trim()) {
    const pattern = `%${filter.query.trim()}%`;
    conditions.push(
      or(
        ilike(privateDocuments.title, pattern),
        ilike(privateDocuments.originalFilename, pattern),
        ilike(privateDocuments.description, pattern),
        ilike(privateDocuments.notes, pattern),
        sql`${privateDocuments.tags}::text ilike ${pattern}`,
      )!,
    );
  }

  const orderBy =
    view === "reminders"
      ? [asc(privateDocuments.reminderAt), desc(privateDocuments.createdAt)]
      : [desc(privateDocuments.createdAt)];

  return db
    .select()
    .from(privateDocuments)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
}

export async function updatePrivateDocument(
  documentId: string,
  userId: string,
  patch: UpdatePrivateDocumentInput,
): Promise<PrivateDocument> {
  const existing = await getPrivateDocumentForUser(documentId, userId);
  if (!existing) {
    throw new DocumentsError("Document not found.", { code: "not_found" });
  }

  if (patch.categoryId) {
    const category = await getDocumentCategoryForUser(patch.categoryId, userId);
    if (!category) {
      throw new DocumentsError("Category not found.", { code: "not_found" });
    }
  }

  if (patch.thumbnailKey) {
    assertOwnedStorageKey(userId, patch.thumbnailKey);
  }

  const nextTitle = patch.title?.trim();
  if (nextTitle !== undefined && !nextTitle) {
    throw new DocumentsError("Document title cannot be empty.", {
      code: "validation",
    });
  }

  const reminder = resolveReminderFields({
    reminderAt: patch.reminderAt,
    reminderKind: patch.reminderKind,
    existingReminderAt: existing.reminderAt,
    existingReminderKind:
      (existing.reminderKind as DocumentReminderKind | null) ?? null,
  });

  const db = getDb();
  const [row] = await db
    .update(privateDocuments)
    .set({
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(nextTitle !== undefined ? { title: nextTitle } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.notes !== undefined
        ? { notes: patch.notes?.trim() || null }
        : {}),
      ...(patch.tags !== undefined ? { tags: cleanTags(patch.tags) } : {}),
      ...(patch.documentDate !== undefined
        ? { documentDate: patch.documentDate }
        : {}),
      ...(patch.importantFlag !== undefined
        ? { importantFlag: patch.importantFlag }
        : {}),
      ...(reminder.reminderAt !== undefined
        ? { reminderAt: reminder.reminderAt }
        : {}),
      ...(reminder.reminderKind !== undefined
        ? { reminderKind: reminder.reminderKind }
        : {}),
      ...(patch.thumbnailKey !== undefined
        ? { thumbnailKey: patch.thumbnailKey }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(privateDocuments.id, documentId),
        eq(privateDocuments.userId, userId),
      ),
    )
    .returning();

  if (!row) {
    throw new DocumentsError("Document not found.", { code: "not_found" });
  }
  return row;
}

/**
 * Bulk-update category and/or important flag for many owner documents.
 * Returns the number of rows updated.
 */
export async function bulkUpdatePrivateDocuments(
  userId: string,
  input: BulkUpdatePrivateDocumentsInput,
): Promise<number> {
  const ids = [...new Set(input.documentIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new DocumentsError("Select at least one document.", {
      code: "validation",
    });
  }
  if (ids.length > 50) {
    throw new DocumentsError("You can update at most 50 documents at once.", {
      code: "validation",
    });
  }
  if (input.categoryId === undefined && input.importantFlag === undefined) {
    throw new DocumentsError("Nothing to update.", { code: "validation" });
  }

  if (input.categoryId) {
    const category = await getDocumentCategoryForUser(input.categoryId, userId);
    if (!category) {
      throw new DocumentsError("Category not found.", { code: "not_found" });
    }
  }

  const db = getDb();
  const updated = await db
    .update(privateDocuments)
    .set({
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(input.importantFlag !== undefined
        ? { importantFlag: input.importantFlag }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(privateDocuments.userId, userId),
        inArray(privateDocuments.id, ids),
      ),
    )
    .returning({ id: privateDocuments.id });

  return updated.length;
}

/**
 * Delete the DB row. Caller is responsible for deleting R2 objects.
 * Returns the deleted row so storage keys can be cleaned up.
 */
export async function deletePrivateDocument(
  documentId: string,
  userId: string,
): Promise<PrivateDocument> {
  const db = getDb();
  const [row] = await db
    .delete(privateDocuments)
    .where(
      and(
        eq(privateDocuments.id, documentId),
        eq(privateDocuments.userId, userId),
      ),
    )
    .returning();

  if (!row) {
    throw new DocumentsError("Document not found.", { code: "not_found" });
  }
  return row;
}

/**
 * Update storage metadata after promote / replace (owner-scoped).
 */
export async function updatePrivateDocumentFile(
  documentId: string,
  userId: string,
  file: {
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    storageKey: string;
    thumbnailKey?: string | null;
  },
): Promise<PrivateDocument> {
  assertOwnedStorageKey(userId, file.storageKey);
  if (file.thumbnailKey) {
    assertOwnedStorageKey(userId, file.thumbnailKey);
  }
  if (!file.originalFilename?.trim()) {
    throw new DocumentsError("originalFilename is required.", {
      code: "validation",
    });
  }
  if (!Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0) {
    throw new DocumentsError("sizeBytes must be a positive number.", {
      code: "validation",
    });
  }

  const db = getDb();
  const [row] = await db
    .update(privateDocuments)
    .set({
      originalFilename: file.originalFilename.trim(),
      contentType: file.contentType.trim(),
      sizeBytes: file.sizeBytes,
      storageKey: file.storageKey,
      thumbnailKey:
        file.thumbnailKey === undefined ? undefined : file.thumbnailKey,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(privateDocuments.id, documentId),
        eq(privateDocuments.userId, userId),
      ),
    )
    .returning();

  if (!row) {
    throw new DocumentsError("Document not found.", { code: "not_found" });
  }
  return row;
}

/**
 * Delete DB row and owned R2 objects (storage + thumbnail).
 */
export async function deletePrivateDocumentWithStorage(
  documentId: string,
  userId: string,
): Promise<PrivateDocument> {
  const row = await deletePrivateDocument(documentId, userId);
  await deletePrivateDocumentObjects({
    userId,
    documentId: row.id,
    storageKey: row.storageKey,
    thumbnailKey: row.thumbnailKey,
  });
  return row;
}

export type PrivateDocumentWithCategory = PrivateDocument & {
  category: DocumentCategory | null;
};

export async function getPrivateDocumentWithCategory(
  documentId: string,
  userId: string,
): Promise<PrivateDocumentWithCategory | null> {
  const doc = await getPrivateDocumentForUser(documentId, userId);
  if (!doc) return null;
  const category = await getDocumentCategoryForUser(doc.categoryId, userId);
  return { ...doc, category };
}

/** Per-category document counts for the owner (sidebar badges). */
export async function countPrivateDocumentsByCategory(
  userId: string,
): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      categoryId: privateDocuments.categoryId,
      count: sql<number>`count(*)::int`,
    })
    .from(privateDocuments)
    .where(eq(privateDocuments.userId, userId))
    .groupBy(privateDocuments.categoryId);

  const out: Record<string, number> = {};
  for (const row of rows) {
    out[row.categoryId] = Number(row.count) || 0;
  }
  return out;
}
