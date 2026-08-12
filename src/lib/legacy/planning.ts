/**
 * Owner-only Legacy Planning checklist CRUD + scoring.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  legacyPlanningItemDocuments,
  legacyPlanningItems,
  privateDocuments,
  type LegacyPlanningItem,
} from "@/lib/db/schema";
import { LegacyError } from "@/lib/legacy/errors";
import {
  LEGACY_PLANNING_CATEGORIES,
  LEGACY_PLANNING_CATEGORY_IDS,
  planningCategoryById,
  type LegacyPlanningCategoryId,
  type LegacyPlanningSensitivity,
} from "@/lib/legacy/planning-categories";
import {
  computePlanningScore,
  isPlanningItemFilled,
  type PlanningScore,
} from "@/lib/legacy/planning-score";

export type PlanningItemWithDocuments = LegacyPlanningItem & {
  attachedDocuments: Array<{ id: string; title: string }>;
};

export type CreatePlanningItemInput = {
  userId: string;
  categoryId: LegacyPlanningCategoryId;
  title: string;
  institution?: string | null;
  accountHint?: string | null;
  locationHint?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  sensitivity?: LegacyPlanningSensitivity;
  lastVerifiedAt?: Date | null;
  documentIds?: string[];
};

export type UpdatePlanningItemInput = Partial<
  Omit<CreatePlanningItemInput, "userId" | "categoryId">
> & {
  categoryId?: LegacyPlanningCategoryId;
};

async function assertOwnedPrivateDocuments(
  userId: string,
  documentIds: string[],
): Promise<string[]> {
  const cleaned = [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))];
  if (cleaned.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ id: privateDocuments.id })
    .from(privateDocuments)
    .where(
      and(
        eq(privateDocuments.userId, userId),
        inArray(privateDocuments.id, cleaned),
      ),
    );
  if (rows.length !== cleaned.length) {
    throw new LegacyError(
      "Related document must be one of your private documents.",
      { code: "validation" },
    );
  }
  return cleaned;
}

async function syncItemDocuments(
  itemId: string,
  userId: string,
  documentIds: string[] | undefined,
): Promise<void> {
  if (documentIds === undefined) return;
  const cleaned = await assertOwnedPrivateDocuments(userId, documentIds.slice(0, 12));
  const db = getDb();
  await db
    .delete(legacyPlanningItemDocuments)
    .where(
      and(
        eq(legacyPlanningItemDocuments.itemId, itemId),
        eq(legacyPlanningItemDocuments.userId, userId),
      ),
    );
  if (cleaned.length === 0) return;
  await db.insert(legacyPlanningItemDocuments).values(
    cleaned.map((documentId) => ({
      itemId,
      documentId,
      userId,
      createdAt: new Date(),
    })),
  );
}

async function attachDocs(
  items: LegacyPlanningItem[],
  userId: string,
): Promise<PlanningItemWithDocuments[]> {
  if (items.length === 0) return [];
  const db = getDb();
  const links = await db
    .select({
      itemId: legacyPlanningItemDocuments.itemId,
      documentId: privateDocuments.id,
      title: privateDocuments.title,
    })
    .from(legacyPlanningItemDocuments)
    .innerJoin(
      privateDocuments,
      eq(privateDocuments.id, legacyPlanningItemDocuments.documentId),
    )
    .where(
      and(
        eq(legacyPlanningItemDocuments.userId, userId),
        inArray(
          legacyPlanningItemDocuments.itemId,
          items.map((i) => i.id),
        ),
      ),
    );

  const byItem = new Map<string, Array<{ id: string; title: string }>>();
  for (const link of links) {
    const list = byItem.get(link.itemId) ?? [];
    list.push({ id: link.documentId, title: link.title });
    byItem.set(link.itemId, list);
  }
  return items.map((item) => ({
    ...item,
    attachedDocuments: byItem.get(item.id) ?? [],
  }));
}

export async function listPlanningItems(
  userId: string,
): Promise<PlanningItemWithDocuments[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(legacyPlanningItems)
    .where(eq(legacyPlanningItems.userId, userId))
    .orderBy(asc(legacyPlanningItems.sortOrder), asc(legacyPlanningItems.createdAt));
  return attachDocs(rows, userId);
}

export async function getPlanningItem(
  itemId: string,
  userId: string,
): Promise<PlanningItemWithDocuments> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(legacyPlanningItems)
    .where(
      and(
        eq(legacyPlanningItems.id, itemId),
        eq(legacyPlanningItems.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new LegacyError("Planning item not found.", { code: "not_found" });
  const [withDocs] = await attachDocs([row], userId);
  return withDocs;
}

export async function createPlanningItem(
  input: CreatePlanningItemInput,
): Promise<PlanningItemWithDocuments> {
  if (!planningCategoryById(input.categoryId)) {
    throw new LegacyError("Unknown planning category.", { code: "validation" });
  }
  const title = input.title.trim();
  if (!title) {
    throw new LegacyError("A title is required.", { code: "validation" });
  }
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(legacyPlanningItems)
    .values({
      id: nanoid(),
      userId: input.userId,
      categoryId: input.categoryId,
      title,
      institution: input.institution?.trim() || null,
      accountHint: input.accountHint?.trim() || null,
      locationHint: input.locationHint?.trim() || null,
      contactName: input.contactName?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      notes: input.notes?.trim() || null,
      sensitivity: input.sensitivity ?? "emergency_ok",
      lastVerifiedAt: input.lastVerifiedAt ?? now,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new LegacyError("Failed to create planning item.");
  await syncItemDocuments(row.id, input.userId, input.documentIds ?? []);
  return getPlanningItem(row.id, input.userId);
}

export async function updatePlanningItem(
  itemId: string,
  userId: string,
  patch: UpdatePlanningItemInput,
): Promise<PlanningItemWithDocuments> {
  await getPlanningItem(itemId, userId);
  if (patch.categoryId && !planningCategoryById(patch.categoryId)) {
    throw new LegacyError("Unknown planning category.", { code: "validation" });
  }
  const db = getDb();
  const now = new Date();
  const set: Partial<LegacyPlanningItem> = { updatedAt: now };
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new LegacyError("A title is required.", { code: "validation" });
    set.title = title;
  }
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;
  if (patch.institution !== undefined) set.institution = patch.institution?.trim() || null;
  if (patch.accountHint !== undefined) set.accountHint = patch.accountHint?.trim() || null;
  if (patch.locationHint !== undefined) set.locationHint = patch.locationHint?.trim() || null;
  if (patch.contactName !== undefined) set.contactName = patch.contactName?.trim() || null;
  if (patch.contactPhone !== undefined) set.contactPhone = patch.contactPhone?.trim() || null;
  if (patch.contactEmail !== undefined) set.contactEmail = patch.contactEmail?.trim() || null;
  if (patch.notes !== undefined) set.notes = patch.notes?.trim() || null;
  if (patch.sensitivity !== undefined) set.sensitivity = patch.sensitivity;
  if (patch.lastVerifiedAt !== undefined) set.lastVerifiedAt = patch.lastVerifiedAt;

  await db
    .update(legacyPlanningItems)
    .set(set)
    .where(
      and(eq(legacyPlanningItems.id, itemId), eq(legacyPlanningItems.userId, userId)),
    );
  await syncItemDocuments(itemId, userId, patch.documentIds);
  return getPlanningItem(itemId, userId);
}

export async function verifyPlanningItem(
  itemId: string,
  userId: string,
): Promise<PlanningItemWithDocuments> {
  return updatePlanningItem(itemId, userId, { lastVerifiedAt: new Date() });
}

export async function deletePlanningItem(
  itemId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .delete(legacyPlanningItems)
    .where(
      and(eq(legacyPlanningItems.id, itemId), eq(legacyPlanningItems.userId, userId)),
    )
    .returning({ id: legacyPlanningItems.id });
  if (rows.length === 0) {
    throw new LegacyError("Planning item not found.", { code: "not_found" });
  }
}

export async function loadPlanningScore(userId: string): Promise<{
  score: PlanningScore;
  items: PlanningItemWithDocuments[];
}> {
  const items = await listPlanningItems(userId);
  const score = computePlanningScore(
    LEGACY_PLANNING_CATEGORY_IDS.map((categoryId) => {
      const inCat = items.filter((i) => i.categoryId === categoryId);
      return {
        categoryId,
        hasFilledItem: inCat.some((i) => isPlanningItemFilled(i)),
        hasDocuments: inCat.some((i) => i.attachedDocuments.length > 0),
      };
    }),
  );
  return { score, items };
}

export function serializePlanningItem(item: PlanningItemWithDocuments) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    title: item.title,
    institution: item.institution,
    accountHint: item.accountHint,
    locationHint: item.locationHint,
    contactName: item.contactName,
    contactPhone: item.contactPhone,
    contactEmail: item.contactEmail,
    notes: item.notes,
    sensitivity: item.sensitivity,
    lastVerifiedAt: item.lastVerifiedAt?.toISOString() ?? null,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    attachedDocuments: item.attachedDocuments,
    filled: isPlanningItemFilled(item),
  };
}

export function serializePlanningBoard(
  score: PlanningScore,
  items: PlanningItemWithDocuments[],
) {
  return {
    score: {
      completenessPercent: score.completenessPercent,
      strengthPercent: score.strengthPercent,
      documentationPercent: score.documentationPercent,
      earnedPoints: score.earnedPoints,
      maxPoints: score.maxPoints,
      completedCategoryIds: score.completedCategoryIds,
      nextCategoryId: score.nextCategoryId,
    },
    categories: LEGACY_PLANNING_CATEGORIES.map((def) => {
      const catScore = score.categories.find((c) => c.categoryId === def.id)!;
      return {
        ...def,
        completed: catScore.completed,
        hasDocuments: catScore.hasDocuments,
        basePoints: catScore.basePoints,
        docBonus: catScore.docBonus,
        earned: catScore.earned,
        max: catScore.max,
        items: items
          .filter((i) => i.categoryId === def.id)
          .map(serializePlanningItem),
      };
    }),
  };
}
