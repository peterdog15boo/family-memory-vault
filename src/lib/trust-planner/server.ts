/**
 * Living Trust Planner — server-only (DB, disclaimer audit).
 * Do not import from Client Components; use `@/lib/trust-planner` instead.
 */

import "server-only";

export * from "@/lib/trust-planner/index";

export {
  hasAcceptedTrustDisclaimer,
  recordTrustDisclaimerAcceptance,
} from "@/lib/trust-planner/acceptance";
export {
  archiveActiveTrustDraft,
  createTrustDraft,
  generateAndSaveTrustDraft,
  getActiveTrustDraft,
  getOwnedTrustDraft,
  listTrustDraftsForOwner,
  serializeTrustDraft,
  serializeTrustDraftSummary,
  setTrustSignedScan,
  updateTrustDraftAnswers,
  updateTrustFundingChecklist,
} from "@/lib/trust-planner/drafts";
export {
  completeTrustSignedScanUpload,
  discardTrustSignedScanTempUpload,
  removeTrustSignedScan,
} from "@/lib/trust-planner/signed-scan";
export {
  buildTrustDraftStorageKey,
  createTrustSignedScanUploadUrl,
} from "@/lib/trust-planner/storage";
export { buildTrustDraftPdf } from "@/lib/trust-planner/pdf";
