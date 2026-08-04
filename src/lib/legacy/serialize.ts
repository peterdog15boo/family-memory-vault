/**
 * JSON-safe shapes for Digital Legacy API / client props.
 */

import type {
  LegacyContact,
  LegacyInstruction,
  LegacyProfile,
  LegacySecureItem,
  LegacyVideo,
  PrivateDocument,
} from "@/lib/db/schema";

export type SerializedLegacyProfile = {
  userId: string;
  summaryMessage: string | null;
  funeralPreferences: string | null;
  generalInstructions: string | null;
  updatedAt: string;
};

export type SerializedLegacyContact = {
  id: string;
  name: string;
  relationship: string | null;
  category: LegacyContact["category"];
  phone: string | null;
  email: string | null;
  notes: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SerializedLegacyInstruction = {
  id: string;
  sectionType: LegacyInstruction["sectionType"];
  title: string;
  content: string;
  attachedDocuments: SerializedLegacyDocumentOption[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SerializedLegacySecureItem = {
  id: string;
  label: string;
  itemType: LegacySecureItem["itemType"];
  /** Null when contentRedacted is true — fetch via reveal endpoint. */
  content: string | null;
  contentRedacted: boolean;
  relatedDocumentId: string | null;
  relatedDocumentTitle: string | null;
  notes: string | null;
  notesRedacted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SerializedLegacyDocumentOption = {
  id: string;
  title: string;
};

export type SerializedLegacyVideo = {
  id: string;
  sectionType: LegacyVideo["sectionType"];
  legacyInstructionId: string | null;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  contentType: string;
  sizeBytes: number;
  sourceType: LegacyVideo["sourceType"];
  sortOrder: number;
  isPrimary: boolean;
  hasThumbnail: boolean;
  createdAt: string;
  updatedAt: string;
  /** Short-lived signed playback URL when requested. */
  playbackUrl?: string | null;
  thumbnailUrl?: string | null;
};

export type LegacyProgressItem = {
  id: string;
  label: string;
  done: boolean;
  href: string;
};

export type LegacyProgress = {
  completed: number;
  total: number;
  items: LegacyProgressItem[];
};

export function serializeLegacyProfile(row: LegacyProfile): SerializedLegacyProfile {
  return {
    userId: row.userId,
    summaryMessage: row.summaryMessage,
    funeralPreferences: row.funeralPreferences,
    generalInstructions: row.generalInstructions,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeLegacyContact(row: LegacyContact): SerializedLegacyContact {
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    category: row.category,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeLegacyInstruction(
  row: LegacyInstruction,
  attachedDocuments: SerializedLegacyDocumentOption[] = [],
): SerializedLegacyInstruction {
  return {
    id: row.id,
    sectionType: row.sectionType,
    title: row.title,
    content: row.content,
    attachedDocuments,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeLegacySecureItem(
  row: LegacySecureItem,
  relatedTitle?: string | null,
  options?: { includeSensitiveFields?: boolean },
): SerializedLegacySecureItem {
  const includeSensitive = options?.includeSensitiveFields ?? false;
  return {
    id: row.id,
    label: row.label,
    itemType: row.itemType,
    content: includeSensitive ? row.content : null,
    contentRedacted: !includeSensitive,
    relatedDocumentId: row.relatedDocumentId,
    relatedDocumentTitle: relatedTitle ?? null,
    notes: includeSensitive ? row.notes : null,
    notesRedacted: !includeSensitive && Boolean(row.notes?.trim()),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeLegacyDocumentOption(
  row: Pick<PrivateDocument, "id" | "title">,
): SerializedLegacyDocumentOption {
  return { id: row.id, title: row.title };
}

export function serializeLegacyVideo(
  row: LegacyVideo,
  urls?: { playbackUrl?: string | null; thumbnailUrl?: string | null },
): SerializedLegacyVideo {
  return {
    id: row.id,
    sectionType: row.sectionType,
    legacyInstructionId: row.legacyInstructionId,
    title: row.title,
    description: row.description,
    durationSeconds: row.durationSeconds,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    sourceType: row.sourceType,
    sortOrder: row.sortOrder,
    isPrimary: Boolean(row.isPrimary),
    hasThumbnail: Boolean(row.thumbnailKey?.trim()),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(urls?.playbackUrl !== undefined
      ? { playbackUrl: urls.playbackUrl }
      : {}),
    ...(urls?.thumbnailUrl !== undefined
      ? { thumbnailUrl: urls.thumbnailUrl }
      : {}),
  };
}
