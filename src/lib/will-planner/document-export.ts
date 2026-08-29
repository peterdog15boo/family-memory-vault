/**
 * Upsert generated Will Planner PDF into Private Documents → Wills / Estate.
 * Owner-only; private-documents* keys only (never gallery / media helpers).
 */

import { nanoid } from "nanoid";
import {
  createPrivateDocument,
  getPrivateDocumentForUser,
  updatePrivateDocument,
  updatePrivateDocumentFile,
} from "@/lib/documents";
import { buildPrivateDocumentStorageKey } from "@/lib/documents/storage";
import type { WillDraft } from "@/lib/db/schema";
import { deleteObject, isPrivateDocumentStorageKey, putObjectBytes } from "@/lib/r2";
import { isR2Configured } from "@/lib/upload/constants";
import { buildSimpleTextPdf } from "@/lib/will-planner/pdf";
import {
  generateWillDraftPlainText,
  WILL_DRAFT_PAGE_HEADER,
  willDraftPageFooter,
} from "@/lib/will-planner/generate";
import type { WillAnswers } from "@/lib/will-planner/questions";
import { ensureWillsEstateCategory } from "@/lib/will-planner/wills-category";
import {
  WILL_PLANNER_DOCUMENT_TAG,
  buildWillPlannerDocumentTitle,
  willDraftIdTag,
} from "@/lib/will-planner/document-meta";

export {
  WILL_PLANNER_DOCUMENT_TAG,
  WILL_DRAFT_ID_TAG_PREFIX,
  buildWillPlannerDocumentTitle,
  parseWillDraftIdFromTags,
  willDraftIdTag,
} from "@/lib/will-planner/document-meta";

/**
 * Create or replace the Private Documents PDF for this will draft.
 */
export async function upsertWillPlannerDocument(input: {
  userId: string;
  draft: WillDraft;
}): Promise<{ documentId: string | null }> {
  if (!isR2Configured()) {
    return { documentId: input.draft.plannerDocumentId ?? null };
  }

  const answers = (input.draft.answers ?? {}) as WillAnswers;
  const markdown =
    input.draft.generatedMarkdown?.trim() ||
    generateWillDraftPlainText(answers);
  const generatedAt = input.draft.generatedAt ?? new Date();
  const legalName = (answers.fullLegalName ?? "").trim() || "Untitled";
  const title = buildWillPlannerDocumentTitle({
    legalName,
    generatedAt,
  });
  const plain = generateWillDraftPlainText(answers);
  const pdf = buildSimpleTextPdf(
    `LAST WILL AND TESTAMENT OF ${legalName.toUpperCase()} — DRAFT`,
    plain,
    {
      pageHeader: WILL_DRAFT_PAGE_HEADER,
      pageFooter: willDraftPageFooter(answers.stateCode),
      stateCode: answers.stateCode,
    },
  );

  const category = await ensureWillsEstateCategory(input.userId);
  const existingId = input.draft.plannerDocumentId?.trim() || null;
  const existing = existingId
    ? await getPrivateDocumentForUser(existingId, input.userId)
    : null;

  const documentId = existing?.id ?? nanoid();
  const filename = "will-planner-draft.pdf";
  const storageKey = buildPrivateDocumentStorageKey({
    userId: input.userId,
    documentId,
    filename,
  });

  if (!isPrivateDocumentStorageKey(storageKey)) {
    throw new Error("Will planner document key must be private-documents.");
  }

  await putObjectBytes(storageKey, pdf, {
    contentType: "application/pdf",
    cacheControl: "private, no-store",
  });

  const description = [
    "Attorney planning draft from Will Planner (not a legal will).",
    `Open in Will Planner: /legacy/will?draft=${input.draft.id}`,
  ].join("\n");

  const notes = [
    "FMV planning draft PDF. Not a signed will.",
    "",
    "— Markdown / plain text —",
    markdown.slice(0, 18000),
  ].join("\n");

  const tags = [
    WILL_PLANNER_DOCUMENT_TAG,
    willDraftIdTag(input.draft.id),
    "estate",
  ];

  if (existing) {
    if (
      existing.storageKey !== storageKey &&
      isPrivateDocumentStorageKey(existing.storageKey)
    ) {
      try {
        await deleteObject(existing.storageKey);
      } catch {
        // best-effort
      }
    }
    await updatePrivateDocumentFile(documentId, input.userId, {
      originalFilename: filename,
      contentType: "application/pdf",
      sizeBytes: pdf.byteLength,
      storageKey,
      thumbnailKey: null,
    });
    await updatePrivateDocument(documentId, input.userId, {
      title,
      description,
      notes,
      tags,
      importantFlag: true,
      documentDate: generatedAt,
      categoryId: category.id,
    });
    return { documentId };
  }

  await createPrivateDocument({
    id: documentId,
    userId: input.userId,
    categoryId: category.id,
    title,
    description,
    notes,
    originalFilename: filename,
    contentType: "application/pdf",
    sizeBytes: pdf.byteLength,
    storageKey,
    tags,
    importantFlag: true,
    documentDate: generatedAt,
  });

  return { documentId };
}
