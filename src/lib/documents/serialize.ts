/**
 * JSON-safe shapes for Private Documents API / client props.
 */

import type { DocumentCategory, PrivateDocument } from "@/lib/db/schema";
import {
  DEFAULT_DOCUMENT_CATEGORY_DEFS,
  type DocumentReminderKind,
} from "@/lib/documents/types";
import { getReminderUrgency, type ReminderUrgency } from "@/lib/documents/dates";

const DEFAULT_SLUGS = new Set(
  DEFAULT_DOCUMENT_CATEGORY_DEFS.map((d) => d.slug as string),
);

export type SerializedDocumentCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  documentCount: number;
  /** True when this is one of the seeded default category slugs. */
  isDefault: boolean;
};

export type SerializedPrivateDocument = {
  id: string;
  categoryId: string;
  title: string;
  description: string | null;
  notes: string | null;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  tags: string[];
  documentDate: string | null;
  importantFlag: boolean;
  reminderAt: string | null;
  reminderKind: DocumentReminderKind | null;
  /** Derived from reminderAt vs today (UTC). */
  reminderUrgency: ReminderUrgency;
  hasThumbnail: boolean;
  createdAt: string;
  updatedAt: string;
  category?: SerializedDocumentCategory | null;
};

function asTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string => typeof t === "string");
}

export function serializeDocumentCategory(
  row: DocumentCategory,
  documentCount = 0,
): SerializedDocumentCategory {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sortOrder,
    documentCount,
    isDefault: DEFAULT_SLUGS.has(row.slug),
  };
}

export function serializePrivateDocument(
  row: PrivateDocument,
  category?: DocumentCategory | null,
): SerializedPrivateDocument {
  return {
    id: row.id,
    categoryId: row.categoryId,
    title: row.title,
    description: row.description,
    notes: row.notes ?? null,
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    tags: asTags(row.tags),
    documentDate: row.documentDate?.toISOString() ?? null,
    importantFlag: row.importantFlag,
    reminderAt: row.reminderAt?.toISOString() ?? null,
    reminderKind: (row.reminderKind as DocumentReminderKind | null) ?? null,
    reminderUrgency: getReminderUrgency(row.reminderAt),
    hasThumbnail: Boolean(row.thumbnailKey?.trim()),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(category !== undefined
      ? {
          category: category
            ? serializeDocumentCategory(category)
            : null,
        }
      : {}),
  };
}
