/**
 * Will Planner — client-safe surface (interview UI, checklist helpers).
 * Server DB / R2 helpers live in `@/lib/will-planner/server`.
 */

export {
  WILL_DISCLAIMER_TEXT,
  WILL_DISCLAIMER_TITLE,
  WILL_DISCLAIMER_VERSION,
} from "@/lib/will-planner/constants";
export { buildSimpleDocx } from "@/lib/will-planner/docx";
export {
  generateWillDraftMarkdown,
  generateWillDraftPlainText,
  WILL_ATTORNEY_NEXT_STEPS,
} from "@/lib/will-planner/generate";
export { buildSimpleTextPdf } from "@/lib/will-planner/pdf";
export {
  CHILD_RELATION_OPTIONS,
  getWillStep,
  hasAnyChildren,
  hasMinors,
  SITUATION_PACK_OPTIONS,
  US_STATE_OPTIONS,
  WILL_STEPS,
  type SituationPackId,
  type WillAnswers,
  type WillChildEntry,
  type WillGiftEntry,
  type WillRealEstateEntry,
  type WillResidueShare,
  type WillSituationPacks,
  type WillStep,
  type WillStepId,
} from "@/lib/will-planner/questions";
export {
  buildWillReadyChecklist,
  willReadyStateLabel,
  WILL_READY_LEGACY_LINKS,
} from "@/lib/will-planner/ready";
export {
  cryptoStepFieldKeys,
  sanitizeWillAnswers,
  WILL_FORBIDDEN_ANSWER_KEYS,
} from "@/lib/will-planner/sanitize";
export {
  buildSigningChecklistTasks,
  isSigningUploadUnlocked,
  isWillSignedScanContentType,
  normalizeSigningChecklistState,
  signingChecklistProgress,
  willMakeRealTone,
  WILL_ESTATE_CATEGORY,
  WILL_MAKE_REAL_TONE,
  WILL_SIGNED_SCAN_CONTENT_TYPES,
  WILL_SIGNED_SCAN_NOTE,
  type SigningChecklistTask,
  type WillSignedScan,
  type WillSigningChecklistState,
} from "@/lib/will-planner/signing-checklist";
export {
  nextWillStepId,
  prevWillStepId,
  resolveCurrentStepId,
  shouldIncludeStep,
  visibleWillSteps,
  willProgressPercent,
} from "@/lib/will-planner/skip";
export type {
  SerializedWillDraft,
  SerializedWillDraftStatus,
  SerializedWillDraftSummary,
} from "@/lib/will-planner/types";
export {
  validateResiduePercents,
  WillGenerateValidationError,
} from "@/lib/will-planner/validate";
