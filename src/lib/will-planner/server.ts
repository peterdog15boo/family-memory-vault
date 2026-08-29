/**
 * Will Planner — server-only (DB, Private Documents, disclaimer audit).
 * Do not import from Client Components; use `@/lib/will-planner` instead.
 */

import "server-only";

export * from "@/lib/will-planner/index";

export {
  hasAcceptedWillDisclaimer,
  recordWillDisclaimerAcceptance,
} from "@/lib/will-planner/acceptance";
export {
  archiveActiveWillDraft,
  createWillDraft,
  generateAndSaveWillDraft,
  getActiveWillDraft,
  getOwnedWillDraft,
  listWillDraftsForOwner,
  serializeWillDraft,
  serializeWillDraftSummary,
  setWillSignedScan,
  updateWillDraftAnswers,
  updateWillSigningChecklist,
  userHasActiveWillDraft,
} from "@/lib/will-planner/drafts";
export {
  completeWillSignedScanUpload,
  ensureWillsEstateCategory,
  removeWillSignedScan,
} from "@/lib/will-planner/signed-scan";
export {
  buildWillPlannerDocumentTitle,
  parseWillDraftIdFromTags,
  upsertWillPlannerDocument,
  WILL_DRAFT_ID_TAG_PREFIX,
  WILL_PLANNER_DOCUMENT_TAG,
  willDraftIdTag,
} from "@/lib/will-planner/document-export";
export {
  willAnswersContentChanged,
  willAnswersContentFingerprint,
} from "@/lib/will-planner/answers-diff";
