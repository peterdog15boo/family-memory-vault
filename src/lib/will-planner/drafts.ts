/**
 * Owner-only Will Planner draft CRUD.
 */

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  willDrafts,
  type WillDraft,
  type WillDraftStatus,
} from "@/lib/db/schema";
import { WILL_DISCLAIMER_VERSION } from "@/lib/will-planner/constants";
import { generateWillDraftMarkdown } from "@/lib/will-planner/generate";
import type { WillAnswers, WillStepId } from "@/lib/will-planner/questions";
import { sanitizeWillAnswers } from "@/lib/will-planner/sanitize";
import {
  normalizeSigningChecklistState,
  type WillSignedScan,
  type WillSigningChecklistState,
} from "@/lib/will-planner/signing-checklist";
import { resolveCurrentStepId } from "@/lib/will-planner/skip";
import type {
  SerializedWillDraft,
  SerializedWillDraftSummary,
} from "@/lib/will-planner/types";
import { WillGenerateValidationError } from "@/lib/will-planner/validate";

export type {
  SerializedWillDraft,
  SerializedWillDraftSummary,
  SerializedWillDraftStatus,
} from "@/lib/will-planner/types";

const ACTIVE_STATUSES: WillDraftStatus[] = ["in_progress", "draft_ready"];

function serializeSignedScan(raw: WillDraft["signedScan"]): WillSignedScan | null {
  if (!raw || typeof raw !== "object") return null;
  if (
    typeof raw.documentId !== "string" ||
    typeof raw.storageKey !== "string" ||
    typeof raw.originalFilename !== "string" ||
    typeof raw.contentType !== "string" ||
    typeof raw.sizeBytes !== "number" ||
    typeof raw.uploadedAt !== "string"
  ) {
    return null;
  }
  return {
    documentId: raw.documentId,
    storageKey: raw.storageKey,
    originalFilename: raw.originalFilename,
    contentType: raw.contentType,
    sizeBytes: raw.sizeBytes,
    uploadedAt: raw.uploadedAt,
    note:
      typeof raw.note === "string" && raw.note.trim()
        ? raw.note
        : "user-supplied scan; FMV does not verify signatures.",
  };
}

export function serializeWillDraft(row: WillDraft): SerializedWillDraft {
  return {
    id: row.id,
    status: row.status,
    stateCode: row.stateCode,
    answers: (row.answers ?? {}) as WillAnswers,
    generatedMarkdown: row.generatedMarkdown,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    disclaimerVersion: row.disclaimerVersion,
    signingChecklist: normalizeSigningChecklistState(row.signingChecklist),
    signedScan: serializeSignedScan(row.signedScan),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeWillDraftSummary(
  row: WillDraft,
): SerializedWillDraftSummary {
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

/** Owner-only list: active + archived drafts, newest first. */
export async function listWillDraftsForOwner(
  userId: string,
  limit = 50,
): Promise<WillDraft[]> {
  const db = getDb();
  return db
    .select()
    .from(willDrafts)
    .where(eq(willDrafts.userId, userId))
    .orderBy(desc(willDrafts.updatedAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function getActiveWillDraft(
  userId: string,
): Promise<WillDraft | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(willDrafts)
    .where(
      and(
        eq(willDrafts.userId, userId),
        inArray(willDrafts.status, ACTIVE_STATUSES),
      ),
    )
    .orderBy(desc(willDrafts.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function userHasActiveWillDraft(userId: string): Promise<boolean> {
  const row = await getActiveWillDraft(userId);
  return Boolean(row);
}

export async function createWillDraft(input: {
  userId: string;
  disclaimerVersion?: string;
  familyId?: string | null;
  answers?: WillAnswers;
}): Promise<WillDraft> {
  const existing = await getActiveWillDraft(input.userId);
  if (existing) {
    return existing;
  }

  const db = getDb();
  const now = new Date();
  const answers: WillAnswers = sanitizeWillAnswers({
    ...(input.answers ?? {}),
    currentStepId: (input.answers?.currentStepId as WillStepId) ?? "packs",
    packs: input.answers?.packs ?? {},
  });
  const [row] = await db
    .insert(willDrafts)
    .values({
      id: nanoid(),
      userId: input.userId,
      familyId: input.familyId ?? null,
      status: "in_progress",
      stateCode: answers.stateCode?.trim() || null,
      answers,
      generatedMarkdown: null,
      generatedAt: null,
      disclaimerVersion:
        input.disclaimerVersion?.trim() || WILL_DISCLAIMER_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("Failed to create will draft");
  return row;
}

export async function updateWillDraftAnswers(input: {
  userId: string;
  draftId: string;
  answers: WillAnswers;
  stepId?: WillStepId;
}): Promise<WillDraft> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(willDrafts)
    .where(
      and(
        eq(willDrafts.id, input.draftId),
        eq(willDrafts.userId, input.userId),
        ne(willDrafts.status, "archived"),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Will draft not found");
  }

  const merged: WillAnswers = sanitizeWillAnswers({
    ...((existing.answers ?? {}) as WillAnswers),
    ...input.answers,
  });
  if (input.stepId) {
    merged.currentStepId = input.stepId;
  } else if (!merged.currentStepId) {
    merged.currentStepId = resolveCurrentStepId(merged);
  }

  // Clear skipped-section answers when flags flip off
  if (merged.childrenStatus === "none") {
    delete merged.children;
    delete merged.guardianName;
    delete merged.guardianCity;
    delete merged.guardianRelationship;
    delete merged.alternateGuardianName;
    delete merged.alternateGuardianCity;
    delete merged.alternateGuardianRelationship;
  } else if (merged.childrenStatus === "adult_only") {
    delete merged.guardianName;
    delete merged.guardianCity;
    delete merged.guardianRelationship;
    delete merged.alternateGuardianName;
    delete merged.alternateGuardianCity;
    delete merged.alternateGuardianRelationship;
  }

  const packs = merged.packs ?? {};
  if (!packs.employee) {
    delete merged.employerName;
    delete merged.retirementPlansNotes;
    delete merged.lifeInsuranceNotes;
  }
  if (!packs.business) {
    delete merged.businessEntityTypes;
    delete merged.businessName;
    delete merged.businessInterestRecipient;
    delete merged.businessOperationsManager;
    delete merged.hasOperatingOrBuySell;
    delete merged.businessTransitionContact;
  }
  if (!packs.investor) {
    delete merged.brokerageNotes;
    delete merged.rentalProperties;
    delete merged.rentalManagerName;
  }
  if (!packs.crypto) {
    delete merged.cryptoHoldingTypes;
    delete merged.cryptoInstructionsLocation;
    delete merged.cryptoAccessRequester;
  }
  if (!packs.complexity) {
    delete merged.flagSpecialNeedsChild;
    delete merged.flagNonUsPropertyOrHeirs;
    delete merged.flagDisinherit;
    delete merged.disinheritName;
    delete merged.flagLivingTrust;
    delete merged.livingTrustNotes;
  }

  if (merged.residueMode !== "specific_percents") {
    delete merged.residueShares;
  }
  if (merged.residueMode !== "own_words") {
    delete merged.residueOwnWords;
  }

  const now = new Date();
  const [row] = await db
    .update(willDrafts)
    .set({
      answers: merged,
      stateCode: merged.stateCode?.trim() || null,
      status: "in_progress",
      // Keep prior generated text until they regenerate, but mark not ready
      updatedAt: now,
    })
    .where(
      and(eq(willDrafts.id, input.draftId), eq(willDrafts.userId, input.userId)),
    )
    .returning();

  if (!row) throw new Error("Failed to update will draft");
  return row;
}

export async function generateAndSaveWillDraft(input: {
  userId: string;
  draftId: string;
}): Promise<WillDraft> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(willDrafts)
    .where(
      and(
        eq(willDrafts.id, input.draftId),
        eq(willDrafts.userId, input.userId),
        ne(willDrafts.status, "archived"),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Will draft not found");
  }

  const answers = sanitizeWillAnswers({
    ...((existing.answers ?? {}) as WillAnswers),
    currentStepId: "review",
  });

  let markdown: string;
  try {
    markdown = generateWillDraftMarkdown(answers);
  } catch (error) {
    if (error instanceof WillGenerateValidationError) {
      throw error;
    }
    throw error;
  }
  const now = new Date();

  const [row] = await db
    .update(willDrafts)
    .set({
      answers,
      generatedMarkdown: markdown,
      generatedAt: now,
      status: "draft_ready",
      stateCode: answers.stateCode?.trim() || null,
      updatedAt: now,
    })
    .where(
      and(eq(willDrafts.id, input.draftId), eq(willDrafts.userId, input.userId)),
    )
    .returning();

  if (!row) throw new Error("Failed to generate will draft");
  return row;
}

/** Archive the active draft so a fresh interview can start. */
export async function archiveActiveWillDraft(
  userId: string,
): Promise<{ archivedId: string | null }> {
  const existing = await getActiveWillDraft(userId);
  if (!existing) return { archivedId: null };

  const db = getDb();
  const now = new Date();
  await db
    .update(willDrafts)
    .set({ status: "archived", updatedAt: now })
    .where(
      and(eq(willDrafts.id, existing.id), eq(willDrafts.userId, userId)),
    );

  return { archivedId: existing.id };
}

export async function getOwnedWillDraft(
  userId: string,
  draftId: string,
): Promise<WillDraft | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(willDrafts)
    .where(
      and(eq(willDrafts.id, draftId), eq(willDrafts.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Merge checkbox state. Does not clear signedScan when unchecking.
 * Never auto-fills from generate.
 */
export async function updateWillSigningChecklist(input: {
  userId: string;
  draftId: string;
  /** Partial map of taskId → checked */
  checks: Record<string, boolean>;
}): Promise<WillDraft> {
  const existing = await getOwnedWillDraft(input.userId, input.draftId);
  if (!existing || existing.status === "archived") {
    throw new Error("Will draft not found");
  }

  const current = normalizeSigningChecklistState(existing.signingChecklist);
  const next: WillSigningChecklistState = {
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
  const [row] = await db
    .update(willDrafts)
    .set({
      signingChecklist: next,
      updatedAt: now,
    })
    .where(
      and(
        eq(willDrafts.id, input.draftId),
        eq(willDrafts.userId, input.userId),
      ),
    )
    .returning();

  if (!row) throw new Error("Failed to update signing checklist");
  return row;
}

export async function setWillSignedScan(input: {
  userId: string;
  draftId: string;
  scan: WillSignedScan | null;
}): Promise<{ draft: WillDraft; previousDocumentId: string | null }> {
  const existing = await getOwnedWillDraft(input.userId, input.draftId);
  if (!existing || existing.status === "archived") {
    throw new Error("Will draft not found");
  }

  const previous = serializeSignedScan(existing.signedScan);
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(willDrafts)
    .set({
      signedScan: input.scan,
      updatedAt: now,
    })
    .where(
      and(
        eq(willDrafts.id, input.draftId),
        eq(willDrafts.userId, input.userId),
      ),
    )
    .returning();

  if (!row) throw new Error("Failed to update signed scan");
  return {
    draft: row,
    previousDocumentId: previous?.documentId ?? null,
  };
}
