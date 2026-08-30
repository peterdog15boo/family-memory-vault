/**
 * Client-safe Trust Planner DTO types (no DB / R2 imports).
 */

import type { TrustFundingChecklistState, TrustSignedScan } from "@/lib/trust-planner/funding-checklist";
import type { TrustAnswers } from "@/lib/trust-planner/questions";

export type SerializedTrustDraftStatus =
  | "in_progress"
  | "draft_ready"
  | "archived";

export type SerializedTrustDraft = {
  id: string;
  status: SerializedTrustDraftStatus;
  stateCode: string | null;
  answers: TrustAnswers;
  generatedMarkdown: string | null;
  generatedAt: string | null;
  disclaimerVersion: string;
  fundingChecklist: TrustFundingChecklistState;
  signedScan: TrustSignedScan | null;
  linkedWillDraftId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedTrustDraftSummary = {
  id: string;
  status: SerializedTrustDraftStatus;
  stateCode: string | null;
  disclaimerVersion: string;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
