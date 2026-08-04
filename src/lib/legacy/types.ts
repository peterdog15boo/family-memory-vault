/**
 * Digital Legacy — domain types.
 *
 * Owner-only by default. Never join into family gallery / shared media.
 */

import {
  LEGACY_CONTACT_CATEGORIES,
  LEGACY_INSTRUCTION_SECTION_TYPES,
  LEGACY_SECURE_ITEM_TYPES,
  LEGACY_VIDEO_SECTION_TYPES,
  LEGACY_VIDEO_SOURCE_TYPES,
} from "@/lib/db/schema";

export type LegacyContactCategory = (typeof LEGACY_CONTACT_CATEGORIES)[number];
export type LegacyInstructionSectionType =
  (typeof LEGACY_INSTRUCTION_SECTION_TYPES)[number];
export type LegacySecureItemType = (typeof LEGACY_SECURE_ITEM_TYPES)[number];
export type LegacyVideoSectionType = (typeof LEGACY_VIDEO_SECTION_TYPES)[number];
export type LegacyVideoSourceType = (typeof LEGACY_VIDEO_SOURCE_TYPES)[number];

export { LEGACY_VIDEO_SECTION_TYPES, LEGACY_VIDEO_SOURCE_TYPES };
export const LEGACY_CONTACT_CATEGORY_LABELS: Record<
  LegacyContactCategory,
  string
> = {
  attorney: "Attorney",
  insurance_agent: "Insurance agent",
  accountant: "Accountant",
  business_partner: "Business partner",
  family: "Family",
  executor: "Executor",
  other: "Other",
};

export const LEGACY_INSTRUCTION_SECTION_LABELS: Record<
  LegacyInstructionSectionType,
  string
> = {
  personal: "Personal",
  financial: "Financial",
  business_operations: "Business operations",
  accounts_access: "Accounts & access",
  legal: "Legal",
  survivors_guidance: "Guidance for survivors",
};

export const LEGACY_SECURE_ITEM_TYPE_LABELS: Record<
  LegacySecureItemType,
  string
> = {
  password: "Password",
  account_info: "Account info",
  location_of_documents: "Location of documents",
  other: "Other",
};

export const LEGACY_VIDEO_SECTION_LABELS: Record<LegacyVideoSectionType, string> =
  {
    personal: "Personal",
    financial: "Financial",
    business_operations: "Business operations",
    accounts_access: "Accounts & access",
    legal: "Legal",
    survivors_guidance: "Guidance for survivors",
    message_to_loved_ones: "Message to loved ones",
    custom: "Custom",
  };

export const LEGACY_VIDEO_SOURCE_LABELS: Record<LegacyVideoSourceType, string> = {
  recorded: "Recorded",
  uploaded: "Uploaded",
};

export type UpsertLegacyProfileInput = {
  userId: string;
  summaryMessage?: string | null;
  funeralPreferences?: string | null;
  generalInstructions?: string | null;
};

export type CreateLegacyContactInput = {
  userId: string;
  name: string;
  relationship?: string | null;
  category?: LegacyContactCategory;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
};

export type UpdateLegacyContactInput = {
  name?: string;
  relationship?: string | null;
  category?: LegacyContactCategory;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
};

export type CreateLegacyInstructionInput = {
  userId: string;
  sectionType: LegacyInstructionSectionType;
  title: string;
  content: string;
  sortOrder?: number;
  documentIds?: string[];
};

export type UpdateLegacyInstructionInput = {
  sectionType?: LegacyInstructionSectionType;
  title?: string;
  content?: string;
  sortOrder?: number;
  documentIds?: string[];
};

export type CreateLegacySecureItemInput = {
  userId: string;
  label: string;
  itemType?: LegacySecureItemType;
  content: string;
  relatedDocumentId?: string | null;
  notes?: string | null;
};

export type UpdateLegacySecureItemInput = {
  label?: string;
  itemType?: LegacySecureItemType;
  content?: string;
  relatedDocumentId?: string | null;
  notes?: string | null;
};

export type CreateLegacyVideoInput = {
  userId: string;
  sectionType: LegacyVideoSectionType;
  title: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  /** Optional pre-assigned id (needed when promoting storage before insert). */
  id?: string;
  description?: string | null;
  thumbnailKey?: string | null;
  durationSeconds?: number | null;
  sourceType?: LegacyVideoSourceType;
  sortOrder?: number;
  isPrimary?: boolean;
  legacyInstructionId?: string | null;
};

export type UpdateLegacyVideoInput = {
  sectionType?: LegacyVideoSectionType;
  title?: string;
  description?: string | null;
  thumbnailKey?: string | null;
  durationSeconds?: number | null;
  sourceType?: LegacyVideoSourceType;
  sortOrder?: number;
  isPrimary?: boolean;
  legacyInstructionId?: string | null;
  /** Replace the stored file (caller must have promoted a new object). */
  storageKey?: string;
  contentType?: string;
  sizeBytes?: number;
};

/** Safety notes — Digital Legacy stays owner-only. */
export const DIGITAL_LEGACY_SAFETY = [
  "legacy_* rows are always filtered by the owning userId.",
  "Digital Legacy defaults to owner-only access — never family-shared.",
  "legacy_videos live under private-legacy-videos/ and are never joined into family media galleries, Memories, Movies, People pages, or shared views.",
  "Legacy video access uses short-lived signed URLs only (60s default / 120s max), matching private documents.",
  "Legacy video lists never pre-sign full playback URLs; posters use purpose thumbnail only when near the viewport.",
  "Abandoned private-legacy-videos-temp/ uploads should be expired via R2 lifecycle (ops); committed deletes remove permanent + thumbnail objects.",
  "Secure item content is redacted in list/API/SSR responses until a reveal endpoint succeeds.",
  "Reveal requires Clerk reverification or explicit confirmation and is audit-logged.",
  "Secure item content must not appear in Memories, Movies, media galleries, notifications, emails, or assistant search.",
  "related_document_id may only reference the owner’s private_documents row.",
  "Emergency grantees read through granted routes only — never owner mutation APIs.",
] as const;
