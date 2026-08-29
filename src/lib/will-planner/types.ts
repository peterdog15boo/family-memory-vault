/**
 * Client-safe Will Planner DTO types (no DB / R2 imports).
 */

import type {
  WillSignedScan,
  WillSigningChecklistState,
} from "@/lib/will-planner/signing-checklist";
import type { WillAnswers } from "@/lib/will-planner/questions";

export type SerializedWillDraftStatus =
  | "in_progress"
  | "draft_ready"
  | "archived";

export type SerializedWillDraft = {
  id: string;
  status: SerializedWillDraftStatus;
  stateCode: string | null;
  answers: WillAnswers;
  generatedMarkdown: string | null;
  generatedAt: string | null;
  disclaimerVersion: string;
  signingChecklist: WillSigningChecklistState;
  signedScan: WillSignedScan | null;
  plannerDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedWillDraftSummary = {
  id: string;
  status: SerializedWillDraftStatus;
  stateCode: string | null;
  disclaimerVersion: string;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
