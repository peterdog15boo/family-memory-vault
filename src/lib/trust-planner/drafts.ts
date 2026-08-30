/**
 * Owner-only Living Trust Planner draft CRUD.
 */

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  trustDrafts,
  type TrustDraft,
  type TrustDraftStatus,
} from "@/lib/db/schema";
import { getActiveWillDraft } from "@/lib/will-planner/drafts";
import { trustAnswersContentChanged } from "@/lib/trust-planner/answers-diff";
import { TRUST_DISCLAIMER_VERSION } from "@/lib/trust-planner/constants";
import { generateTrustDraftMarkdown } from "@/lib/trust-planner/generate";
import {
  normalizeFundingChecklistState,
  type TrustFundingChecklistState,
  type TrustSignedScan,
} from "@/lib/trust-planner/funding-checklist";
import type { TrustAnswers, TrustStepId } from "@/lib/trust-planner/questions";
import { sanitizeTrustAnswers } from "@/lib/trust-planner/sanitize";
import { resolveCurrentTrustStepId } from "@/lib/trust-planner/skip";
import type {
  SerializedTrustDraft,
  SerializedTrustDraftSummary,
} from "@/lib/trust-planner/types";
import { TrustGenerateValidationError } from "@/lib/trust-planner/validate";

export type {
  SerializedTrustDraft,
  SerializedTrustDraftSummary,
  SerializedTrustDraftStatus,
} from "@/lib/trust-planner/types";

const ACTIVE_STATUSES: TrustDraftStatus[] = ["in_progress", "draft_ready"];

function serializeSignedScan(
  raw: TrustDraft["signedScan"],
): TrustSignedScan | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as TrustSignedScan;
  if (
    typeof s.documentId !== "string" ||
    typeof s.storageKey !== "string" ||
    typeof s.originalFilename !== "string" ||
    typeof s.contentType !== "string" ||
    typeof s.sizeBytes !== "number" ||
    typeof s.uploadedAt !== "string" ||
    typeof s.note !== "string"
  ) {
    return null;
  }
  return s;
}

export function serializeTrustDraft(row: TrustDraft): SerializedTrustDraft {
  return {
    id: row.id,
    status: row.status,
    stateCode: row.stateCode,
    answers: (row.answers ?? {}) as TrustAnswers,
    generatedMarkdown: row.generatedMarkdown,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    disclaimerVersion: row.disclaimerVersion,
    fundingChecklist: normalizeFundingChecklistState(row.fundingChecklist),
    signedScan: serializeSignedScan(row.signedScan),
    linkedWillDraftId: row.linkedWillDraftId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeTrustDraftSummary(
  row: TrustDraft,
): SerializedTrustDraftSummary {
  return {
    id: row.id,
    status: row.status,
    stateCode: row.stateCode,
    disclaimerVersion: row.disclaimerVersion,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTrustDraftsForOwner(
  userId: string,
  limit = 50,
): Promise<TrustDraft[]> {
  const db = getDb();
  return db
    .select()
    .from(trustDrafts)
    .where(eq(trustDrafts.userId, userId))
    .orderBy(desc(trustDrafts.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getActiveTrustDraft(
  userId: string,
): Promise<TrustDraft | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(trustDrafts)
    .where(
      and(
        eq(trustDrafts.userId, userId),
        inArray(trustDrafts.status, ACTIVE_STATUSES),
      ),
    )
    .orderBy(desc(trustDrafts.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getOwnedTrustDraft(
  userId: string,
  draftId: string,
): Promise<TrustDraft | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(trustDrafts)
    .where(
      and(eq(trustDrafts.id, draftId), eq(trustDrafts.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

async function resolveLinkedWillDraftId(
  userId: string,
  answers: TrustAnswers,
): Promise<string | null> {
  if (answers.wantsPourOverWill !== true) return null;
  const willDraft = await getActiveWillDraft(userId);
  return willDraft?.id ?? null;
}

export async function createTrustDraft(input: {
  userId: string;
  disclaimerVersion?: string;
  answers?: TrustAnswers;
}): Promise<TrustDraft> {
  const existing = await getActiveTrustDraft(input.userId);
  if (existing) {
    return existing;
  }

  const db = getDb();
  const now = new Date();
  const answers: TrustAnswers = sanitizeTrustAnswers({
    ...(input.answers ?? {}),
    currentStepId: (input.answers?.currentStepId as TrustStepId) ?? "packs",
    packs: input.answers?.packs ?? {},
  });

  const [row] = await db
    .insert(trustDrafts)
    .values({
      id: nanoid(),
      userId: input.userId,
      status: "in_progress",
      stateCode: answers.stateCode?.trim() || null,
      answers,
      generatedMarkdown: null,
      generatedAt: null,
      fundingChecklist: { checks: {} },
      disclaimerVersion:
        input.disclaimerVersion?.trim() || TRUST_DISCLAIMER_VERSION,
      linkedWillDraftId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("Failed to create trust draft");
  return row;
}

export async function updateTrustDraftAnswers(input: {
  userId: string;
  draftId: string;
  answers: TrustAnswers;
  stepId?: TrustStepId;
}): Promise<TrustDraft> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(trustDrafts)
    .where(
      and(
        eq(trustDrafts.id, input.draftId),
        eq(trustDrafts.userId, input.userId),
        ne(trustDrafts.status, "archived"),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Trust draft not found");
  }

  const merged: TrustAnswers = sanitizeTrustAnswers({
    ...((existing.answers ?? {}) as TrustAnswers),
    ...input.answers,
  });
  if (input.stepId) {
    merged.currentStepId = input.stepId;
  } else if (!merged.currentStepId) {
    merged.currentStepId = resolveCurrentTrustStepId(merged);
  }

  // Clear skipped-section answers when packs / flags flip off
  const packs = merged.packs ?? {};
  if (!packs.married) {
    delete merged.spouseOrPartnerName;
  }
  if (!packs.real_estate) {
    delete merged.realEstateAddresses;
  }
  if (!packs.bank_brokerage) {
    delete merged.bankBrokerageNotes;
  }
  if (!packs.retirement) {
    delete merged.retirementLifeInsuranceNotes;
  }
  if (!packs.business) {
    delete merged.businessEntityType;
    delete merged.businessName;
    delete merged.businessOperatingAgreementConsent;
  }
  if (!packs.crypto) {
    delete merged.cryptoDigitalNotes;
  }

  if (merged.hasCoTrustee !== true) {
    delete merged.coTrusteeName;
  }
  if (merged.residueMode !== "specific_percents") {
    delete merged.residueShares;
  }
  if (merged.minorHoldAge !== "custom") {
    delete merged.minorHoldCustomAge;
  }
  if (merged.wantsPourOverWill !== true) {
    delete merged.pourOverNotes;
  }

  const now = new Date();
  const previousAnswers = (existing.answers ?? {}) as TrustAnswers;
  const contentChanged = trustAnswersContentChanged(previousAnswers, merged);
  const nextStatus =
    existing.status === "draft_ready" && !contentChanged
      ? "draft_ready"
      : "in_progress";

  const linkedWillDraftId = await resolveLinkedWillDraftId(
    input.userId,
    merged,
  );

  const [row] = await db
    .update(trustDrafts)
    .set({
      answers: merged,
      stateCode: merged.stateCode?.trim() || null,
      status: nextStatus,
      linkedWillDraftId,
      updatedAt: now,
    })
    .where(
      and(
        eq(trustDrafts.id, input.draftId),
        eq(trustDrafts.userId, input.userId),
      ),
    )
    .returning();

  if (!row) throw new Error("Failed to update trust draft");
  return row;
}

export async function generateAndSaveTrustDraft(input: {
  userId: string;
  draftId: string;
}): Promise<TrustDraft> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(trustDrafts)
    .where(
      and(
        eq(trustDrafts.id, input.draftId),
        eq(trustDrafts.userId, input.userId),
        ne(trustDrafts.status, "archived"),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Trust draft not found");
  }

  const answers = sanitizeTrustAnswers({
    ...((existing.answers ?? {}) as TrustAnswers),
    currentStepId: "review",
  });

  const linkedWillDraftId = await resolveLinkedWillDraftId(
    input.userId,
    answers,
  );

  let markdown: string;
  try {
    markdown = generateTrustDraftMarkdown(answers, { linkedWillDraftId });
  } catch (error) {
    if (error instanceof TrustGenerateValidationError) {
      throw error;
    }
    throw error;
  }
  const now = new Date();

  const [row] = await db
    .update(trustDrafts)
    .set({
      answers,
      generatedMarkdown: markdown,
      generatedAt: now,
      status: "draft_ready",
      stateCode: answers.stateCode?.trim() || null,
      linkedWillDraftId,
      updatedAt: now,
    })
    .where(
      and(
        eq(trustDrafts.id, input.draftId),
        eq(trustDrafts.userId, input.userId),
      ),
    )
    .returning();

  if (!row) throw new Error("Failed to generate trust draft");
  return row;
}

export async function archiveActiveTrustDraft(
  userId: string,
): Promise<{ archivedId: string | null }> {
  const existing = await getActiveTrustDraft(userId);
  if (!existing) return { archivedId: null };

  const db = getDb();
  const now = new Date();
  await db
    .update(trustDrafts)
    .set({ status: "archived", updatedAt: now })
    .where(
      and(eq(trustDrafts.id, existing.id), eq(trustDrafts.userId, userId)),
    );

  return { archivedId: existing.id };
}

export async function updateTrustFundingChecklist(input: {
  userId: string;
  draftId: string;
  checks: Record<string, boolean>;
}): Promise<TrustDraft> {
  const existing = await getOwnedTrustDraft(input.userId, input.draftId);
  if (!existing || existing.status === "archived") {
    throw new Error("Trust draft not found");
  }

  const current = normalizeFundingChecklistState(existing.fundingChecklist);
  const next: TrustFundingChecklistState = {
    checks: { ...current.checks },
  };
  for (const [taskId, checked] of Object.entries(input.checks)) {
    const id = taskId.trim();
    if (!id || id.length > 64) continue;
    if (typeof checked !== "boolean") continue;
    next.checks[id] = checked;
  }

  const db = getDb();
  const now = new Date();
  // Does not clear signedScan when unchecking funding tasks.
  const [row] = await db
    .update(trustDrafts)
    .set({
      fundingChecklist: next,
      updatedAt: now,
    })
    .where(
      and(
        eq(trustDrafts.id, input.draftId),
        eq(trustDrafts.userId, input.userId),
      ),
    )
    .returning();

  if (!row) throw new Error("Failed to update funding checklist");
  return row;
}

export async function setTrustSignedScan(input: {
  userId: string;
  draftId: string;
  scan: TrustSignedScan | null;
}): Promise<{
  draft: TrustDraft;
  previousDocumentId: string | null;
  previousStorageKey: string | null;
}> {
  const existing = await getOwnedTrustDraft(input.userId, input.draftId);
  if (!existing || existing.status === "archived") {
    throw new Error("Trust draft not found");
  }

  const previous = serializeSignedScan(existing.signedScan);
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(trustDrafts)
    .set({
      signedScan: input.scan,
      updatedAt: now,
    })
    .where(
      and(
        eq(trustDrafts.id, input.draftId),
        eq(trustDrafts.userId, input.userId),
      ),
    )
    .returning();

  if (!row) throw new Error("Failed to update signed scan");
  return {
    draft: row,
    previousDocumentId: previous?.documentId ?? null,
    previousStorageKey: previous?.storageKey ?? null,
  };
}
