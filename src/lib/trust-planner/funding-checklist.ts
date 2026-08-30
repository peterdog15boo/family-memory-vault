/**
 * Post-generate funding & signing checklist (owner-only task checks).
 * Checking boxes does not fund the trust or validate signatures.
 */

import {
  isCommunityPropertyState,
  type TrustAnswers,
} from "@/lib/trust-planner/questions";
import { willExecutionStateLabel } from "@/lib/legacy/will-execution-by-state";

export const TRUST_FUNDING_TONE =
  "Checking a box here does not fund the trust or validate signatures. Only properly signed originals and assets retitled or directed as counsel advises matter under [State] law.";

export function trustFundingTone(stateCode: string | null | undefined): string {
  const state = willExecutionStateLabel(stateCode);
  return TRUST_FUNDING_TONE.replace("[State]", state);
}

export type TrustFundingChecklistTask = {
  id: string;
  label: string;
  required: boolean;
  optional?: boolean;
  /** Deep link for companion pour-over will checklist. */
  href?: string;
};

export type TrustFundingChecklistState = {
  checks: Record<string, boolean>;
};

export type TrustSignedScan = {
  documentId: string;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  note: string;
};

export const TRUST_SIGNED_SCAN_NOTE =
  "user-supplied scan; FMV does not verify signatures or funding.";

export const TRUST_SIGNED_SCAN_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type TrustSignedScanContentType =
  (typeof TRUST_SIGNED_SCAN_CONTENT_TYPES)[number];

export function isTrustSignedScanContentType(
  value: string,
): value is TrustSignedScanContentType {
  const normalized =
    value.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  return (TRUST_SIGNED_SCAN_CONTENT_TYPES as readonly string[]).includes(
    normalized,
  );
}

export function buildFundingChecklistTasks(
  answers: TrustAnswers,
  stateCode: string | null | undefined,
  linkedWillDraftId: string | null,
): TrustFundingChecklistTask[] {
  const willHref = linkedWillDraftId
    ? `/legacy/will?draft=${encodeURIComponent(linkedWillDraftId)}&view=hub`
    : "/legacy/will";

  const tasks: TrustFundingChecklistTask[] = [
    {
      id: "attorney_prepares",
      label: "Attorney prepares the trust",
      required: true,
    },
    {
      id: "sign_trust",
      label:
        "Sign the trust as your attorney directs (notary acknowledgment is common)",
      required: true,
    },
    {
      id: "pour_over_will",
      label:
        "Sign companion pour-over will — follow the Will Planner signing checklist",
      required: true,
      href: willHref,
    },
    {
      id: "store_originals",
      label:
        "Store signed originals safely; tell successor trustees they are named",
      required: true,
    },
  ];

  const addresses = answers.realEstateAddresses ?? [];
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i]?.address?.trim();
    if (!address) continue;
    tasks.push({
      id: `fund_property_${i}`,
      label: `Deed ${address} into the trust via attorney/title company`,
      required: false,
      optional: true,
    });
  }

  if (answers.packs?.bank_brokerage) {
    tasks.push({
      id: "fund_bank_brokerage",
      label:
        "Bank and brokerage accounts: retitle into the trust or use TOD/POD as your attorney directs",
      required: false,
      optional: true,
    });
  }

  if (answers.packs?.retirement) {
    tasks.push({
      id: "fund_retirement",
      label:
        "Retirement and life insurance: review beneficiary designation forms with counsel — do not guess",
      required: false,
      optional: true,
    });
  }

  if (answers.packs?.business) {
    tasks.push({
      id: "fund_business",
      label:
        "Business interest: update operating agreement / ownership ledger as attorney directs",
      required: false,
      optional: true,
    });
  }

  if (answers.packs?.crypto) {
    tasks.push({
      id: "fund_digital",
      label:
        "Digital assets: document locations in Legacy notes only — do not put keys in the trust PDF",
      required: false,
      optional: true,
    });
  }

  if (isCommunityPropertyState(stateCode) && answers.packs?.married) {
    tasks.push({
      id: "community_property",
      label:
        "Confirm with attorney what you can transfer vs spouse's share of community property",
      required: false,
      optional: true,
    });
  }

  tasks.push({
    id: "pour_over_probate_note",
    label:
      "Assets still in your personal name may still go through probate — that is why the pour-over will exists",
    required: false,
    optional: true,
  });

  tasks.push({
    id: "upload_scan",
    label:
      "Upload a scan of the signed trust to Legacy / Estate documents (optional archive)",
    required: false,
    optional: true,
  });

  return tasks;
}

export function normalizeFundingChecklistState(
  raw: unknown,
): TrustFundingChecklistState {
  if (!raw || typeof raw !== "object") return { checks: {} };
  const checks = (raw as { checks?: unknown }).checks;
  if (!checks || typeof checks !== "object") return { checks: {} };
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(checks)) {
    if (typeof value === "boolean") out[key] = value;
  }
  return { checks: out };
}

export function fundingChecklistProgress(
  tasks: TrustFundingChecklistTask[],
  state: TrustFundingChecklistState,
): { checked: number; required: number; percent: number } {
  const requiredTasks = tasks.filter((t) => t.required);
  const checked = requiredTasks.filter((t) => state.checks[t.id] === true)
    .length;
  const required = requiredTasks.length;
  return {
    checked,
    required,
    percent: required === 0 ? 0 : Math.round((checked / required) * 100),
  };
}

export function isFundingUploadUnlocked(
  state: TrustFundingChecklistState,
): boolean {
  return (
    state.checks.attorney_prepares === true &&
    state.checks.sign_trust === true
  );
}
