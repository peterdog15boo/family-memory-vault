/**
 * “Make this a real will” checklist — real-world steps, not the draft itself.
 */

import {
  getWillExecutionForState,
  willExecutionStateLabel,
  type WillExecutionByState,
} from "@/lib/legacy/will-execution-by-state";

export const WILL_MAKE_REAL_TONE =
  "Checking a box here does not make the draft valid. Only a properly signed original under [State] law does.";

export function willMakeRealTone(stateCode: string | null | undefined): string {
  const state = willExecutionStateLabel(stateCode);
  return WILL_MAKE_REAL_TONE.replace("[State]", state);
}

export type SigningChecklistTask = {
  id: string;
  label: string;
  /** Counts toward progress denominator. */
  required: boolean;
  /** Soft emphasis — optional community-property / e-will notes. */
  optional?: boolean;
};

export type WillSigningChecklistState = {
  checks: Record<string, boolean>;
};

export type WillSignedScan = {
  documentId: string;
  storageKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  note: string;
};

export const WILL_SIGNED_SCAN_NOTE =
  "user-supplied scan; FMV does not verify signatures.";

export const WILL_ESTATE_CATEGORY = {
  name: "Wills / Estate",
  slug: "wills-estate",
  description: "Wills, estate planning drafts, and related signed originals",
  sortOrder: 55,
} as const;

/** PDF / JPEG / PNG only for signed-will scans. */
export const WILL_SIGNED_SCAN_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type WillSignedScanContentType =
  (typeof WILL_SIGNED_SCAN_CONTENT_TYPES)[number];

export function isWillSignedScanContentType(
  value: string,
): value is WillSignedScanContentType {
  const normalized =
    value.trim().toLowerCase().split(";")[0]?.trim() ?? "";
  return (WILL_SIGNED_SCAN_CONTENT_TYPES as readonly string[]).includes(
    normalized,
  );
}

/**
 * Task ids that must be checked before we treat upload as “unlocked”
 * (upload remains available anytime with an optional label).
 */
export const SIGNING_UNLOCK_TASK_IDS = [
  "meet_attorney",
  "attorney_prepares",
  "sign_ceremony",
] as const;

export function buildSigningChecklistTasks(
  stateCode: string | null | undefined,
): SigningChecklistTask[] {
  const info = getWillExecutionForState(stateCode);
  const state = willExecutionStateLabel(
    info.stateCode === "DEFAULT" ? stateCode : info.stateCode,
  );

  const tasks: SigningChecklistTask[] = [
    {
      id: "read_draft",
      label:
        "Read the draft and fix names/percents in the planner if needed",
      required: true,
    },
    {
      id: "meet_attorney",
      label: `Meet a licensed attorney in ${state} with this draft`,
      required: true,
    },
    {
      id: "attorney_prepares",
      label:
        "Attorney prepares the executable original (do not sign the FMV PDF as-is unless the attorney says that exact paper is the one to sign)",
      required: true,
    },
  ];

  // Task 4–5: state-specific signing / self-proving
  if (info.stateCode === "LA" || info.notaryOnWill === "required_notarial") {
    tasks.push({
      id: "sign_ceremony",
      label:
        "Notarial signing with notary + two witnesses (olographic / fully handwritten is a different path — not recommended from this draft)",
      required: true,
    });
  } else {
    tasks.push({
      id: "sign_ceremony",
      label: signCeremonyLabel(info),
      required: true,
    });
    tasks.push({
      id: "self_proving",
      label: selfProvingLabel(info),
      required: info.selfProving === "recommended",
      optional: info.selfProving !== "recommended",
    });
  }

  tasks.push(
    {
      id: "keep_original",
      label:
        "Ask the attorney where to keep the original (fireproof / attorney vault). Do not rely only on a scan.",
      required: true,
    },
    {
      id: "store_secrets",
      label:
        "Store secrets (passwords, crypto locations, business how-to) in Digital Legacy notes — not in the will text",
      required: true,
    },
    {
      id: "tell_executor",
      label:
        "Tell the executor / personal representative that a will exists and who holds the original",
      required: true,
    },
    {
      id: "upload_scan",
      label:
        "Upload a scan of the signed document to Legacy files (optional archive)",
      required: false,
      optional: true,
    },
  );

  if (info.communityProperty) {
    tasks.push({
      id: "community_property",
      label:
        "Confirm with attorney what you can give away vs spouse’s share of community property",
      required: false,
      optional: true,
    });
  }

  if (info.eWills === "maybe_ask_attorney") {
    tasks.push({
      id: "e_will_caution",
      label:
        "Do not DocuSign this draft unless your attorney is using a statute-compliant e-will process",
      required: false,
      optional: true,
    });
  }

  return tasks;
}

function signCeremonyLabel(info: WillExecutionByState): string {
  if (info.notaryOnWill === "optional_alternative") {
    return "Sign with the required witnesses — or ask your attorney if a notary acknowledgment is the method for this state. Do not skip counsel.";
  }
  const bullet =
    info.bullets.find((b) => /witness/i.test(b)) ??
    "Two adult witnesses, same sitting, in your presence.";
  return `Sign with the required witnesses — ${bullet}`;
}

function selfProvingLabel(info: WillExecutionByState): string {
  if (info.selfProving === "limited") {
    return "Ask your attorney how this state proves the will";
  }
  if (info.selfProving === "different_procedure") {
    return "Ask your attorney about this state’s self-proving / probate procedure (not the usual UPC affidavit-at-signing model)";
  }
  if (info.selfProving === "recommended") {
    return "Complete self-proving / notary step if your attorney recommends it for this state";
  }
  return "Ask your attorney whether a self-proving affidavit is available at signing";
}

export function normalizeSigningChecklistState(
  raw: unknown,
): WillSigningChecklistState {
  const checks: Record<string, boolean> = {};
  if (raw && typeof raw === "object" && "checks" in raw) {
    const c = (raw as { checks?: unknown }).checks;
    if (c && typeof c === "object") {
      for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
        if (typeof v === "boolean") checks[k] = v;
      }
    }
  }
  return { checks };
}

export function signingChecklistProgress(
  tasks: SigningChecklistTask[],
  state: WillSigningChecklistState,
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

export function isSigningUploadUnlocked(
  state: WillSigningChecklistState,
): boolean {
  return SIGNING_UNLOCK_TASK_IDS.every((id) => state.checks[id] === true);
}
