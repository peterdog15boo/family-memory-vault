/**
 * Living Trust Planner — client-safe surface (interview UI, checklist helpers).
 * Server DB / R2 helpers live in `@/lib/trust-planner/server`.
 */

export {
  TRUST_DISCLAIMER_TEXT,
  TRUST_DISCLAIMER_TITLE,
  TRUST_DISCLAIMER_VERSION,
} from "@/lib/trust-planner/constants";
export {
  generateTrustDraftMarkdown,
  generateTrustDraftPlainText,
  TRUST_DRAFT_COVER_WARNING,
  TRUST_DRAFT_PAGE_HEADER,
  trustDraftPageFooter,
} from "@/lib/trust-planner/generate";
export { buildTrustDraftPdf } from "@/lib/trust-planner/pdf";
export {
  buildFundingChecklistTasks,
  fundingChecklistProgress,
  isFundingUploadUnlocked,
  isTrustSignedScanContentType,
  normalizeFundingChecklistState,
  trustFundingTone,
  TRUST_SIGNED_SCAN_CONTENT_TYPES,
  TRUST_SIGNED_SCAN_NOTE,
  type TrustFundingChecklistState,
  type TrustFundingChecklistTask,
  type TrustSignedScan,
} from "@/lib/trust-planner/funding-checklist";
export {
  COMMUNITY_PROPERTY_STATE_CODES,
  TRUST_PACK_OPTIONS,
  TRUST_STEPS,
  US_STATE_OPTIONS,
  defaultTrustName,
  getTrustStep,
  isCommunityPropertyState,
  type TrustAnswers,
  type TrustBusinessEntityType,
  type TrustFieldDef,
  type TrustGiftEntry,
  type TrustMinorHoldAge,
  type TrustPackId,
  type TrustRealEstateEntry,
  type TrustResidueMode,
  type TrustResidueShare,
  type TrustSituationPacks,
  type TrustStep,
  type TrustStepId,
} from "@/lib/trust-planner/questions";
export {
  sanitizeTrustAnswers,
  TRUST_FORBIDDEN_ANSWER_KEYS,
} from "@/lib/trust-planner/sanitize";
export {
  nextTrustStepId,
  prevTrustStepId,
  resolveCurrentTrustStepId,
  shouldIncludeTrustStep,
  trustProgressPercent,
  visibleTrustSteps,
} from "@/lib/trust-planner/skip";
export type {
  SerializedTrustDraft,
  SerializedTrustDraftStatus,
  SerializedTrustDraftSummary,
} from "@/lib/trust-planner/types";
export {
  trustAnswersContentChanged,
  trustAnswersContentFingerprint,
} from "@/lib/trust-planner/answers-diff";
export {
  TrustGenerateValidationError,
  validateTrustResiduePercents,
} from "@/lib/trust-planner/validate";
