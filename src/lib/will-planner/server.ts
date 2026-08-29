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
