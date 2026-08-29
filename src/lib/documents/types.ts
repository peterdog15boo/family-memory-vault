/**
 * Private Documents — domain types.
 *
 * Documents are strictly owner-scoped. They must never appear in family
 * gallery / shared media surfaces.
 */

import { DOCUMENT_REMINDER_KINDS } from "@/lib/db/schema";

export type DocumentReminderKind = (typeof DOCUMENT_REMINDER_KINDS)[number];

export const DOCUMENT_REMINDER_KIND_LABELS: Record<DocumentReminderKind, string> =
  {
    renewal: "Policy / license renewal",
    contract_end: "Contract end date",
    expiration: "Expiration / due date",
    review: "Periodic review",
    other: "General reminder",
  };

export { DOCUMENT_REMINDER_KINDS };

export const DEFAULT_DOCUMENT_CATEGORY_DEFS = [
  {
    name: "Insurance",
    slug: "insurance",
    description: "Policies, claims, and coverage documents",
    sortOrder: 10,
  },
  {
    name: "Financial",
    slug: "financial",
    description: "Banking, statements, and tax records",
    sortOrder: 20,
  },
  {
    name: "Contracts",
    slug: "contracts",
    description: "Agreements and signed contracts",
    sortOrder: 30,
  },
  {
    name: "Real Estate",
    slug: "real-estate",
    description: "Deeds, leases, and property paperwork",
    sortOrder: 40,
  },
  {
    name: "Investments",
    slug: "investments",
    description: "Brokerage, retirement, and investment records",
    sortOrder: 50,
  },
  {
    name: "Wills / Estate",
    slug: "wills-estate",
    description: "Wills, estate planning drafts, and related signed originals",
    sortOrder: 55,
  },
  {
    name: "Legal",
    slug: "legal",
    description: "Court, estate, and legal correspondence",
    sortOrder: 60,
  },
  {
    name: "Medical",
    slug: "medical",
    description: "Health records, prescriptions, and insurance medical",
    sortOrder: 70,
  },
  {
    name: "Business",
    slug: "business",
    description: "Company and self-employment documents",
    sortOrder: 80,
  },
  {
    name: "Personal Identification",
    slug: "personal-identification",
    description: "IDs, passports, licenses, and certificates",
    sortOrder: 90,
  },
  {
    name: "Other",
    slug: "other",
    description: "Everything else",
    sortOrder: 100,
  },
] as const;

export type DefaultDocumentCategorySlug =
  (typeof DEFAULT_DOCUMENT_CATEGORY_DEFS)[number]["slug"];

export type DocumentCategoryDef = {
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
};

export type CreateDocumentCategoryInput = {
  userId: string;
  name: string;
  slug?: string;
  description?: string | null;
  sortOrder?: number;
};

export type UpdateDocumentCategoryInput = {
  name?: string;
  description?: string | null;
  sortOrder?: number;
};

export type CreatePrivateDocumentInput = {
  userId: string;
  categoryId: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  thumbnailKey?: string | null;
  tags?: string[];
  documentDate?: Date | null;
  importantFlag?: boolean;
  reminderAt?: Date | null;
  reminderKind?: DocumentReminderKind | null;
  /** Optional pre-allocated id (e.g. when promoting R2 objects into a known path). */
  id?: string;
};

export type UpdatePrivateDocumentInput = {
  categoryId?: string;
  title?: string;
  description?: string | null;
  notes?: string | null;
  tags?: string[];
  documentDate?: Date | null;
  importantFlag?: boolean;
  reminderAt?: Date | null;
  reminderKind?: DocumentReminderKind | null;
  thumbnailKey?: string | null;
};

export type PrivateDocumentListView =
  | "all"
  | "important"
  | "recent"
  | "reminders";

export type ListPrivateDocumentsFilter = {
  categoryId?: string;
  importantOnly?: boolean;
  /** Shortcut views: important / recently uploaded / upcoming reminders. */
  view?: PrivateDocumentListView;
  /** Days window for view=recent (default 30). */
  recentDays?: number;
  tag?: string;
  /** Case-insensitive match against title / filename / tags / notes. */
  query?: string;
  limit?: number;
  offset?: number;
};

export type BulkUpdatePrivateDocumentsInput = {
  documentIds: string[];
  categoryId?: string;
  importantFlag?: boolean;
};

/** Safety note for docs / reviews — documents stay out of family sharing. */
export const PRIVATE_DOCUMENTS_SAFETY = [
  "private_documents rows are always filtered by the owning userId.",
  "Document R2 keys live under private-documents/ (staging: private-documents-temp/) and are never promoted into media/gallery paths.",
  "Access is short-lived signed URLs only (60s default, 120s max); gallery getDownloadUrl/getUploadUrl refuse private-document keys.",
  "Full document download requires session step-up or explicit in-app confirmation and is audit-logged.",
  "Thumbnails are image derivatives only — never OCR text, document bodies, or metadata previews.",
  "Private documents are isolated from Memories, Movies, family sharing, and assistant search.",
  "Family co-member access must not list or download another member’s private documents.",
  "Notifications and emails must not include document titles beyond generic alerts or file contents.",
] as const;
