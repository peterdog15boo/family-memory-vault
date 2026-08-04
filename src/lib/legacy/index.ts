/**
 * Digital Legacy — owner-scoped CRUD.
 *
 * Invariants:
 * - Every query filters by userId.
 * - Never joined into family gallery / Memories / Movies / assistant media search.
 * - Secure items may optionally link to the owner’s private documents only.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  LEGACY_CONTACT_CATEGORIES,
  LEGACY_INSTRUCTION_SECTION_TYPES,
  LEGACY_SECURE_ITEM_TYPES,
  legacyContacts,
  legacyInstructionDocuments,
  legacyInstructions,
  legacyProfiles,
  legacySecureItems,
  privateDocuments,
  type LegacyContact,
  type LegacyInstructionDocument,
  type LegacyInstruction,
  type LegacyProfile,
  type LegacySecureItem,
} from "@/lib/db/schema";
import {
  DIGITAL_LEGACY_SAFETY,
  type CreateLegacyContactInput,
  type CreateLegacyInstructionInput,
  type CreateLegacySecureItemInput,
  type LegacyContactCategory,
  type LegacyInstructionSectionType,
  type LegacySecureItemType,
  type UpdateLegacyContactInput,
  type UpdateLegacyInstructionInput,
  type UpdateLegacySecureItemInput,
  type UpsertLegacyProfileInput,
} from "@/lib/legacy/types";
import { LegacyError } from "@/lib/legacy/errors";

export { LegacyError } from "@/lib/legacy/errors";
export {
  DIGITAL_LEGACY_SAFETY,
  LEGACY_CONTACT_CATEGORY_LABELS,
  LEGACY_INSTRUCTION_SECTION_LABELS,
  LEGACY_SECURE_ITEM_TYPE_LABELS,
  LEGACY_VIDEO_SECTION_LABELS,
  LEGACY_VIDEO_SOURCE_LABELS,
} from "@/lib/legacy/types";
export type {
  CreateLegacyContactInput,
  CreateLegacyInstructionInput,
  CreateLegacySecureItemInput,
  CreateLegacyVideoInput,
  LegacyContactCategory,
  LegacyInstructionSectionType,
  LegacySecureItemType,
  LegacyVideoSectionType,
  LegacyVideoSourceType,
  UpdateLegacyContactInput,
  UpdateLegacyInstructionInput,
  UpdateLegacySecureItemInput,
  UpdateLegacyVideoInput,
  UpsertLegacyProfileInput,
} from "@/lib/legacy/types";

export {
  createLegacyVideo,
  deleteLegacyVideo,
  getLegacyVideoForUser,
  listLegacyVideos,
  listLegacyVideosBySection,
  listLegacyVideosGroupedBySection,
  reorderLegacyVideos,
  setLegacyVideoPrimary,
  updateLegacyVideo,
} from "@/lib/legacy/videos";

export {
  LEGACY_VIDEO_ALLOWED_CONTENT_TYPES,
  LEGACY_VIDEO_MAX_BYTES,
  LEGACY_VIDEO_PLAYBACK_EXPIRES_IN_SECONDS,
  LEGACY_VIDEO_PLAYBACK_MAX_EXPIRES_IN_SECONDS,
  LEGACY_VIDEO_UPLOAD_EXPIRES_IN_SECONDS,
  LegacyVideoStorageError,
  assertAllowedLegacyVideoUpload,
  assertLegacyVideoKeyForUser,
  assertOwnedLegacyVideoStorageKey,
  buildLegacyVideoStorageKey,
  buildLegacyVideoTempKey,
  buildLegacyVideoThumbnailKey,
  deleteLegacyVideoObject,
  deleteLegacyVideoObjects,
  generateLegacyVideoThumbnail,
  getLegacyVideoPlaybackUrl,
  getLegacyVideoUploadUrl,
  normalizeLegacyVideoContentType,
  promoteLegacyVideoTempToPermanent,
} from "@/lib/legacy/video-storage";
export type {
  LegacyVideoAllowedContentType,
  LegacyVideoPlaybackUrlResult,
  LegacyVideoThumbnailResult,
  LegacyVideoUploadUrlResult,
  PromoteLegacyVideoResult,
} from "@/lib/legacy/video-storage";

const CONTACT_SET = new Set<string>(LEGACY_CONTACT_CATEGORIES);
const SECTION_SET = new Set<string>(LEGACY_INSTRUCTION_SECTION_TYPES);
const ITEM_TYPE_SET = new Set<string>(LEGACY_SECURE_ITEM_TYPES);

function assertUserId(userId: string): void {
  if (!userId?.trim()) {
    throw new LegacyError("userId is required.", { code: "validation" });
  }
}

function cleanOptionalText(
  value: string | null | undefined,
  max: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function assertContactCategory(
  category: string,
): asserts category is LegacyContactCategory {
  if (!CONTACT_SET.has(category)) {
    throw new LegacyError(`Invalid contact category: ${category}`, {
      code: "validation",
    });
  }
}

function assertSectionType(
  sectionType: string,
): asserts sectionType is LegacyInstructionSectionType {
  if (!SECTION_SET.has(sectionType)) {
    throw new LegacyError(`Invalid instruction section: ${sectionType}`, {
      code: "validation",
    });
  }
}

function assertItemType(
  itemType: string,
): asserts itemType is LegacySecureItemType {
  if (!ITEM_TYPE_SET.has(itemType)) {
    throw new LegacyError(`Invalid secure item type: ${itemType}`, {
      code: "validation",
    });
  }
}

async function assertOwnedPrivateDocument(
  documentId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: privateDocuments.id })
    .from(privateDocuments)
    .where(
      and(
        eq(privateDocuments.id, documentId),
        eq(privateDocuments.userId, userId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new LegacyError(
      "Related document must be one of your private documents.",
      { code: "validation" },
    );
  }
}

async function assertOwnedPrivateDocuments(
  userId: string,
  documentIds: string[] | undefined,
): Promise<string[]> {
  const cleaned = [...new Set((documentIds ?? []).map((id) => id.trim()).filter(Boolean))];
  for (const documentId of cleaned) {
    await assertOwnedPrivateDocument(documentId, userId);
  }
  return cleaned;
}

async function syncInstructionDocuments(
  instructionId: string,
  userId: string,
  documentIds: string[] | undefined,
): Promise<void> {
  if (documentIds === undefined) return;
  const cleaned = await assertOwnedPrivateDocuments(userId, documentIds);
  const db = getDb();
  await db
    .delete(legacyInstructionDocuments)
    .where(
      and(
        eq(legacyInstructionDocuments.instructionId, instructionId),
        eq(legacyInstructionDocuments.userId, userId),
      ),
    );

  if (cleaned.length === 0) return;

  await db.insert(legacyInstructionDocuments).values(
    cleaned.map((documentId) => ({
      instructionId,
      documentId,
      userId,
      createdAt: new Date(),
    })),
  );
}

export async function listLegacyInstructionDocuments(
  userId: string,
): Promise<LegacyInstructionDocument[]> {
  assertUserId(userId);
  const db = getDb();
  return db
    .select()
    .from(legacyInstructionDocuments)
    .where(eq(legacyInstructionDocuments.userId, userId));
}

/* -------------------------------------------------------------------------- */
/* Profile                                                                    */
/* -------------------------------------------------------------------------- */

export async function getLegacyProfile(
  userId: string,
): Promise<LegacyProfile | null> {
  assertUserId(userId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(legacyProfiles)
    .where(eq(legacyProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Ensure a profile row exists (empty) so UI can always edit one record.
 */
export async function ensureLegacyProfile(
  userId: string,
): Promise<LegacyProfile> {
  const existing = await getLegacyProfile(userId);
  if (existing) return existing;

  const db = getDb();
  const [row] = await db
    .insert(legacyProfiles)
    .values({
      userId,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (row) return row;
  const again = await getLegacyProfile(userId);
  if (!again) throw new LegacyError("Failed to create legacy profile.");
  return again;
}

export async function upsertLegacyProfile(
  input: UpsertLegacyProfileInput,
): Promise<LegacyProfile> {
  assertUserId(input.userId);
  const db = getDb();
  const now = new Date();

  const [row] = await db
    .insert(legacyProfiles)
    .values({
      userId: input.userId,
      summaryMessage:
        cleanOptionalText(input.summaryMessage, 20000) ?? null,
      funeralPreferences:
        cleanOptionalText(input.funeralPreferences, 20000) ?? null,
      generalInstructions:
        cleanOptionalText(input.generalInstructions, 20000) ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: legacyProfiles.userId,
      set: {
        ...(input.summaryMessage !== undefined
          ? {
              summaryMessage: cleanOptionalText(input.summaryMessage, 20000) ?? null,
            }
          : {}),
        ...(input.funeralPreferences !== undefined
          ? {
              funeralPreferences:
                cleanOptionalText(input.funeralPreferences, 20000) ?? null,
            }
          : {}),
        ...(input.generalInstructions !== undefined
          ? {
              generalInstructions:
                cleanOptionalText(input.generalInstructions, 20000) ?? null,
            }
          : {}),
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new LegacyError("Failed to save legacy profile.");
  return row;
}

/* -------------------------------------------------------------------------- */
/* Contacts                                                                   */
/* -------------------------------------------------------------------------- */

export async function listLegacyContacts(
  userId: string,
): Promise<LegacyContact[]> {
  assertUserId(userId);
  const db = getDb();
  return db
    .select()
    .from(legacyContacts)
    .where(eq(legacyContacts.userId, userId))
    .orderBy(
      desc(legacyContacts.isPrimary),
      asc(legacyContacts.name),
    );
}

export async function getLegacyContactForUser(
  contactId: string,
  userId: string,
): Promise<LegacyContact | null> {
  assertUserId(userId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(legacyContacts)
    .where(
      and(eq(legacyContacts.id, contactId), eq(legacyContacts.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

export async function createLegacyContact(
  input: CreateLegacyContactInput,
): Promise<LegacyContact> {
  assertUserId(input.userId);
  const name = input.name.trim();
  if (!name) {
    throw new LegacyError("Contact name is required.", { code: "validation" });
  }
  const category = input.category ?? "other";
  assertContactCategory(category);

  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(legacyContacts)
    .values({
      id: nanoid(),
      userId: input.userId,
      name: name.slice(0, 200),
      relationship: cleanOptionalText(input.relationship, 200) ?? null,
      category,
      phone: cleanOptionalText(input.phone, 80) ?? null,
      email: cleanOptionalText(input.email, 320) ?? null,
      notes: cleanOptionalText(input.notes, 4000) ?? null,
      isPrimary: Boolean(input.isPrimary),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new LegacyError("Failed to create contact.");
  return row;
}

export async function updateLegacyContact(
  contactId: string,
  userId: string,
  patch: UpdateLegacyContactInput,
): Promise<LegacyContact> {
  const existing = await getLegacyContactForUser(contactId, userId);
  if (!existing) {
    throw new LegacyError("Contact not found.", { code: "not_found" });
  }

  if (patch.category !== undefined) assertContactCategory(patch.category);
  const nextName = patch.name?.trim();
  if (nextName !== undefined && !nextName) {
    throw new LegacyError("Contact name cannot be empty.", {
      code: "validation",
    });
  }

  const db = getDb();
  const [row] = await db
    .update(legacyContacts)
    .set({
      ...(nextName !== undefined ? { name: nextName.slice(0, 200) } : {}),
      ...(patch.relationship !== undefined
        ? { relationship: cleanOptionalText(patch.relationship, 200) ?? null }
        : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.phone !== undefined
        ? { phone: cleanOptionalText(patch.phone, 80) ?? null }
        : {}),
      ...(patch.email !== undefined
        ? { email: cleanOptionalText(patch.email, 320) ?? null }
        : {}),
      ...(patch.notes !== undefined
        ? { notes: cleanOptionalText(patch.notes, 4000) ?? null }
        : {}),
      ...(patch.isPrimary !== undefined
        ? { isPrimary: Boolean(patch.isPrimary) }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(legacyContacts.id, contactId), eq(legacyContacts.userId, userId)),
    )
    .returning();

  if (!row) throw new LegacyError("Contact not found.", { code: "not_found" });
  return row;
}

export async function deleteLegacyContact(
  contactId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(legacyContacts)
    .where(
      and(eq(legacyContacts.id, contactId), eq(legacyContacts.userId, userId)),
    )
    .returning({ id: legacyContacts.id });
  if (deleted.length === 0) {
    throw new LegacyError("Contact not found.", { code: "not_found" });
  }
}

/* -------------------------------------------------------------------------- */
/* Instructions                                                               */
/* -------------------------------------------------------------------------- */

export async function listLegacyInstructions(
  userId: string,
  sectionType?: LegacyInstructionSectionType,
): Promise<LegacyInstruction[]> {
  assertUserId(userId);
  if (sectionType) assertSectionType(sectionType);
  const db = getDb();
  const conditions = [eq(legacyInstructions.userId, userId)];
  if (sectionType) {
    conditions.push(eq(legacyInstructions.sectionType, sectionType));
  }
  return db
    .select()
    .from(legacyInstructions)
    .where(and(...conditions))
    .orderBy(
      asc(legacyInstructions.sectionType),
      asc(legacyInstructions.sortOrder),
      asc(legacyInstructions.title),
    );
}

export async function getLegacyInstructionForUser(
  instructionId: string,
  userId: string,
): Promise<LegacyInstruction | null> {
  assertUserId(userId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(legacyInstructions)
    .where(
      and(
        eq(legacyInstructions.id, instructionId),
        eq(legacyInstructions.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createLegacyInstruction(
  input: CreateLegacyInstructionInput,
): Promise<LegacyInstruction> {
  assertUserId(input.userId);
  assertSectionType(input.sectionType);
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title) {
    throw new LegacyError("Instruction title is required.", {
      code: "validation",
    });
  }
  if (!content) {
    throw new LegacyError("Instruction content is required.", {
      code: "validation",
    });
  }

  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(legacyInstructions)
    .values({
      id: nanoid(),
      userId: input.userId,
      sectionType: input.sectionType,
      title: title.slice(0, 200),
      content: content.slice(0, 50000),
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new LegacyError("Failed to create instruction.");
  await syncInstructionDocuments(row.id, input.userId, input.documentIds);
  return row;
}

export async function updateLegacyInstruction(
  instructionId: string,
  userId: string,
  patch: UpdateLegacyInstructionInput,
): Promise<LegacyInstruction> {
  const existing = await getLegacyInstructionForUser(instructionId, userId);
  if (!existing) {
    throw new LegacyError("Instruction not found.", { code: "not_found" });
  }
  if (patch.sectionType !== undefined) assertSectionType(patch.sectionType);

  const nextTitle = patch.title?.trim();
  if (nextTitle !== undefined && !nextTitle) {
    throw new LegacyError("Instruction title cannot be empty.", {
      code: "validation",
    });
  }
  const nextContent = patch.content?.trim();
  if (nextContent !== undefined && !nextContent) {
    throw new LegacyError("Instruction content cannot be empty.", {
      code: "validation",
    });
  }

  const db = getDb();
  const [row] = await db
    .update(legacyInstructions)
    .set({
      ...(patch.sectionType !== undefined
        ? { sectionType: patch.sectionType }
        : {}),
      ...(nextTitle !== undefined ? { title: nextTitle.slice(0, 200) } : {}),
      ...(nextContent !== undefined
        ? { content: nextContent.slice(0, 50000) }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(legacyInstructions.id, instructionId),
        eq(legacyInstructions.userId, userId),
      ),
    )
    .returning();

  if (!row) {
    throw new LegacyError("Instruction not found.", { code: "not_found" });
  }
  await syncInstructionDocuments(instructionId, userId, patch.documentIds);
  return row;
}

export async function deleteLegacyInstruction(
  instructionId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(legacyInstructions)
    .where(
      and(
        eq(legacyInstructions.id, instructionId),
        eq(legacyInstructions.userId, userId),
      ),
    )
    .returning({ id: legacyInstructions.id });
  if (deleted.length === 0) {
    throw new LegacyError("Instruction not found.", { code: "not_found" });
  }
}

/* -------------------------------------------------------------------------- */
/* Secure items                                                               */
/* -------------------------------------------------------------------------- */

export async function listLegacySecureItems(
  userId: string,
): Promise<LegacySecureItem[]> {
  assertUserId(userId);
  const db = getDb();
  return db
    .select()
    .from(legacySecureItems)
    .where(eq(legacySecureItems.userId, userId))
    .orderBy(asc(legacySecureItems.label));
}

export async function getLegacySecureItemForUser(
  itemId: string,
  userId: string,
): Promise<LegacySecureItem | null> {
  assertUserId(userId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(legacySecureItems)
    .where(
      and(
        eq(legacySecureItems.id, itemId),
        eq(legacySecureItems.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createLegacySecureItem(
  input: CreateLegacySecureItemInput,
): Promise<LegacySecureItem> {
  assertUserId(input.userId);
  const label = input.label.trim();
  const content = input.content.trim();
  if (!label) {
    throw new LegacyError("Secure item label is required.", {
      code: "validation",
    });
  }
  if (!content) {
    throw new LegacyError("Secure item content is required.", {
      code: "validation",
    });
  }
  const itemType = input.itemType ?? "other";
  assertItemType(itemType);

  if (input.relatedDocumentId) {
    await assertOwnedPrivateDocument(input.relatedDocumentId, input.userId);
  }

  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(legacySecureItems)
    .values({
      id: nanoid(),
      userId: input.userId,
      label: label.slice(0, 200),
      itemType,
      content: content.slice(0, 50000),
      relatedDocumentId: input.relatedDocumentId ?? null,
      notes: cleanOptionalText(input.notes, 4000) ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new LegacyError("Failed to create secure item.");
  return row;
}

export async function updateLegacySecureItem(
  itemId: string,
  userId: string,
  patch: UpdateLegacySecureItemInput,
): Promise<LegacySecureItem> {
  const existing = await getLegacySecureItemForUser(itemId, userId);
  if (!existing) {
    throw new LegacyError("Secure item not found.", { code: "not_found" });
  }
  if (patch.itemType !== undefined) assertItemType(patch.itemType);

  const nextLabel = patch.label?.trim();
  if (nextLabel !== undefined && !nextLabel) {
    throw new LegacyError("Secure item label cannot be empty.", {
      code: "validation",
    });
  }
  const nextContent = patch.content?.trim();
  if (nextContent !== undefined && !nextContent) {
    throw new LegacyError("Secure item content cannot be empty.", {
      code: "validation",
    });
  }

  if (patch.relatedDocumentId) {
    await assertOwnedPrivateDocument(patch.relatedDocumentId, userId);
  }

  const db = getDb();
  const [row] = await db
    .update(legacySecureItems)
    .set({
      ...(nextLabel !== undefined ? { label: nextLabel.slice(0, 200) } : {}),
      ...(patch.itemType !== undefined ? { itemType: patch.itemType } : {}),
      ...(nextContent !== undefined
        ? { content: nextContent.slice(0, 50000) }
        : {}),
      ...(patch.relatedDocumentId !== undefined
        ? { relatedDocumentId: patch.relatedDocumentId }
        : {}),
      ...(patch.notes !== undefined
        ? { notes: cleanOptionalText(patch.notes, 4000) ?? null }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(legacySecureItems.id, itemId),
        eq(legacySecureItems.userId, userId),
      ),
    )
    .returning();

  if (!row) {
    throw new LegacyError("Secure item not found.", { code: "not_found" });
  }
  return row;
}

export async function deleteLegacySecureItem(
  itemId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(legacySecureItems)
    .where(
      and(
        eq(legacySecureItems.id, itemId),
        eq(legacySecureItems.userId, userId),
      ),
    )
    .returning({ id: legacySecureItems.id });
  if (deleted.length === 0) {
    throw new LegacyError("Secure item not found.", { code: "not_found" });
  }
}

/** Convenience load of the full owner vault (profile + lists). */
export async function getDigitalLegacyVault(userId: string): Promise<{
  profile: LegacyProfile;
  contacts: LegacyContact[];
  instructions: LegacyInstruction[];
  secureItems: LegacySecureItem[];
}> {
  assertUserId(userId);
  const [profile, contacts, instructions, secureItems] = await Promise.all([
    ensureLegacyProfile(userId),
    listLegacyContacts(userId),
    listLegacyInstructions(userId),
    listLegacySecureItems(userId),
  ]);
  return { profile, contacts, instructions, secureItems };
}

/** Re-export for reviews / docs. */
export const DIGITAL_LEGACY_OWNER_ONLY = DIGITAL_LEGACY_SAFETY;
