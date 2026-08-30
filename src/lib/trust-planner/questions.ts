/**
 * Living Trust Planner interview answers + question catalog (client-safe).
 * Revocable living trust planning only — no irrevocable / tax / Crummey / QTIP.
 */

export { US_STATE_OPTIONS } from "@/lib/will-planner/questions";

/** States with community-property regimes (show attorney note when married pack on). */
export const COMMUNITY_PROPERTY_STATE_CODES = [
  "AZ",
  "CA",
  "ID",
  "LA",
  "NV",
  "NM",
  "TX",
  "WA",
  "WI",
] as const;

export type TrustStepId =
  | "packs"
  | "basics"
  | "married"
  | "trustees"
  | "residue"
  | "minors"
  | "gifts"
  | "incapacity"
  | "real_estate"
  | "bank_brokerage"
  | "retirement"
  | "business"
  | "crypto"
  | "pour_over"
  | "review";

export type TrustPackId =
  | "married"
  | "real_estate"
  | "bank_brokerage"
  | "retirement"
  | "business"
  | "crypto";

export type TrustSituationPacks = {
  married?: boolean;
  real_estate?: boolean;
  bank_brokerage?: boolean;
  retirement?: boolean;
  business?: boolean;
  crypto?: boolean;
};

export type TrustResidueMode = "spouse_then_children" | "specific_percents";

export type TrustResidueShare = {
  name: string;
  percent: number | "";
};

export type TrustGiftEntry = {
  item: string;
  recipient: string;
};

export type TrustRealEstateEntry = {
  address: string;
};

export type TrustMinorHoldAge =
  | "outright"
  | "18"
  | "21"
  | "25"
  | "30"
  | "custom";

export type TrustBusinessEntityType =
  | "sole_prop"
  | "llc"
  | "s_corp"
  | "partnership"
  | "other";

export type TrustFieldType =
  | "text"
  | "textarea"
  | "select"
  | "state"
  | "yesno"
  | "packs_checklist"
  | "residue_shares"
  | "gifts_list"
  | "addresses_list";

export type TrustFieldDef = {
  key: keyof TrustAnswers;
  label: string;
  type: TrustFieldType;
  hint?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  showWhen?: (answers: TrustAnswers) => boolean;
};

export type TrustStep = {
  id: TrustStepId;
  title: string;
  description: string;
  whyWeAsk?: string;
  fields: TrustFieldDef[];
};

export type TrustAnswers = {
  /** Wizard cursor — last step the user was on. */
  currentStepId?: string;

  packs?: TrustSituationPacks;

  fullLegalName?: string;
  otherNamesUsed?: string;
  city?: string;
  county?: string;
  stateCode?: string;
  trustName?: string;

  /** Married / partner pack */
  spouseOrPartnerName?: string;

  /** Initial trustee is always the user (grantor). Optional co-trustee. */
  hasCoTrustee?: boolean;
  coTrusteeName?: string;
  successorTrusteeName?: string;
  alternateSuccessorTrusteeName?: string;

  residueMode?: TrustResidueMode;
  residueShares?: TrustResidueShare[];

  minorHoldAge?: TrustMinorHoldAge;
  minorHoldCustomAge?: string;
  minorHoldNotes?: string;

  specificGifts?: TrustGiftEntry[];

  /** Acknowledge successor manages if incapacitated (attorney drafts standard). */
  incapacityAcknowledged?: boolean;

  realEstateAddresses?: TrustRealEstateEntry[];

  bankBrokerageNotes?: string;

  retirementLifeInsuranceNotes?: string;

  businessEntityType?: TrustBusinessEntityType;
  businessName?: string;
  businessOperatingAgreementConsent?: boolean;

  cryptoDigitalNotes?: string;

  wantsPourOverWill?: boolean;
  pourOverNotes?: string;
};

export const TRUST_PACK_OPTIONS: Array<{
  id: TrustPackId;
  label: string;
  description: string;
}> = [
  {
    id: "married",
    label: "Married / partner",
    description: "Spouse or partner details; community-property note in some states",
  },
  {
    id: "real_estate",
    label: "Real estate",
    description: "Property addresses only — funding / retitling comes later",
  },
  {
    id: "bank_brokerage",
    label: "Bank / brokerage",
    description: "Accounts to discuss with counsel — no account numbers",
  },
  {
    id: "retirement",
    label: "Retirement / life insurance",
    description: "Beneficiary forms usually matter more than retitling into the trust",
  },
  {
    id: "business",
    label: "Business",
    description: "Entity type and name; flag operating-agreement consent",
  },
  {
    id: "crypto",
    label: "Crypto / digital assets",
    description: "No keys or passwords — point to Digital Legacy notes",
  },
];

export function isCommunityPropertyState(stateCode: string | undefined): boolean {
  if (!stateCode?.trim()) return false;
  return (COMMUNITY_PROPERTY_STATE_CODES as readonly string[]).includes(
    stateCode.trim().toUpperCase(),
  );
}

/** Default trust name: “[Last name] Family Trust dated [today]”. */
export function defaultTrustName(
  fullLegalName: string | undefined,
  dated: Date = new Date(),
): string {
  const parts = (fullLegalName ?? "").trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 0 ? parts[parts.length - 1]! : "Family";
  const y = dated.getFullYear();
  const m = dated.getMonth();
  const d = dated.getDate();
  const local = new Date(y, m, d);
  const datedStr = local.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `${last} Family Trust dated ${datedStr}`;
}

export const TRUST_STEPS: TrustStep[] = [
  {
    id: "packs",
    title: "What applies to you?",
    description:
      "Optional packs add a few short questions. Leave any off to skip those sections.",
    fields: [
      {
        key: "packs",
        label: "Situation packs",
        type: "packs_checklist",
        hint: "You can change these later by jumping back to this step.",
      },
    ],
  },
  {
    id: "basics",
    title: "You & the trust name",
    description:
      "Your legal identity, domicile, and a working title for the revocable living trust.",
    whyWeAsk:
      "Trust law varies by state. Your attorney needs your legal name and domicile to draft an instrument that fits local rules.",
    fields: [
      {
        key: "fullLegalName",
        label: "Full legal name",
        type: "text",
        required: true,
        hint: "As it appears on your ID or passport.",
      },
      {
        key: "otherNamesUsed",
        label: "Other names / aliases",
        type: "text",
        hint: "Maiden names, prior legal names, or common aliases (optional).",
      },
      {
        key: "city",
        label: "City of domicile",
        type: "text",
        required: true,
      },
      {
        key: "county",
        label: "County",
        type: "text",
        hint: "Optional but helpful for local counsel.",
      },
      {
        key: "stateCode",
        label: "State of domicile",
        type: "state",
        required: true,
        hint: "Use the state where you live. Laws differ.",
      },
      {
        key: "trustName",
        label: "Working trust name",
        type: "text",
        required: true,
        hint: "Defaults to “[Last name] Family Trust dated [today]”. Your attorney may rename this.",
      },
    ],
  },
  {
    id: "married",
    title: "Spouse / partner",
    description: "If you are married or have a partner, capture their legal name for counsel.",
    fields: [
      {
        key: "spouseOrPartnerName",
        label: "Spouse or partner’s full legal name",
        type: "text",
        required: true,
      },
    ],
  },
  {
    id: "trustees",
    title: "Trustees",
    description:
      "You are the initial trustee. Optionally name a co-trustee, then a successor and alternate.",
    whyWeAsk:
      "Most revocable living trusts name the grantor as initial trustee, with a successor if you cannot serve.",
    fields: [
      {
        key: "hasCoTrustee",
        label: "Do you want an optional co-trustee while you are alive?",
        type: "yesno",
        hint: "Initial trustee is you. A co-trustee is optional.",
      },
      {
        key: "coTrusteeName",
        label: "Co-trustee name",
        type: "text",
        showWhen: (a) => a.hasCoTrustee === true,
      },
      {
        key: "successorTrusteeName",
        label: "Successor trustee",
        type: "text",
        required: true,
        hint: "Person or institution to step in if you cannot serve.",
      },
      {
        key: "alternateSuccessorTrusteeName",
        label: "Alternate successor trustee",
        type: "text",
        hint: "If the first successor cannot serve.",
      },
    ],
  },
  {
    id: "residue",
    title: "Residue beneficiaries",
    description:
      "Who should receive what’s left after specific gifts — percents must total 100%, or choose spouse then children equally.",
    fields: [
      {
        key: "residueMode",
        label: "How should the residue be divided?",
        type: "select",
        required: true,
        options: [
          {
            value: "spouse_then_children",
            label: "Spouse then children equally",
          },
          {
            value: "specific_percents",
            label: "Specific people and percents (must total 100%)",
          },
        ],
      },
      {
        key: "residueShares",
        label: "Residue shares",
        type: "residue_shares",
        showWhen: (a) => a.residueMode === "specific_percents",
        hint: "Percents must total exactly 100% before you can generate a draft.",
      },
    ],
  },
  {
    id: "minors",
    title: "Gifts to minors",
    description:
      "If a beneficiary is under a chosen age, should their share be held in trust or distributed outright?",
    fields: [
      {
        key: "minorHoldAge",
        label: "When a share is for a minor",
        type: "select",
        required: true,
        options: [
          { value: "outright", label: "Outright (no age hold)" },
          { value: "18", label: "Hold until age 18" },
          { value: "21", label: "Hold until age 21" },
          { value: "25", label: "Hold until age 25" },
          { value: "30", label: "Hold until age 30" },
          { value: "custom", label: "Custom age" },
        ],
      },
      {
        key: "minorHoldCustomAge",
        label: "Custom age",
        type: "text",
        showWhen: (a) => a.minorHoldAge === "custom",
        hint: "Number only — your attorney will draft the hold language.",
      },
      {
        key: "minorHoldNotes",
        label: "Notes for counsel (optional)",
        type: "textarea",
        hint: "Staggered ages, education needs, or other plain-English wishes.",
      },
    ],
  },
  {
    id: "gifts",
    title: "Specific gifts (optional)",
    description:
      "Optional items or cash amounts for named people. Skip if everything should follow the residue plan.",
    fields: [
      {
        key: "specificGifts",
        label: "Specific gifts",
        type: "gifts_list",
        hint: "Leave empty if none.",
      },
    ],
  },
  {
    id: "incapacity",
    title: "If you are incapacitated",
    description:
      "If you cannot manage the trust, your successor trustee steps in. Your attorney drafts the standard incapacity language.",
    whyWeAsk:
      "This planner does not invent incapacity definitions — counsel will include the usual standards for your state.",
    fields: [
      {
        key: "incapacityAcknowledged",
        label:
          "I understand that if I am incapacitated, the successor trustee manages the trust, and an attorney will draft the standard language.",
        type: "yesno",
        required: true,
      },
    ],
  },
  {
    id: "real_estate",
    title: "Real estate",
    description:
      "List addresses only. Retitling into the trust (funding) is a separate step with your attorney.",
    fields: [
      {
        key: "realEstateAddresses",
        label: "Property addresses",
        type: "addresses_list",
        hint: "Street address is enough for planning — funding comes later.",
      },
    ],
  },
  {
    id: "bank_brokerage",
    title: "Bank / brokerage",
    description:
      "Describe accounts in plain English. Do not enter account numbers.",
    fields: [
      {
        key: "bankBrokerageNotes",
        label: "Bank and brokerage notes",
        type: "textarea",
        hint: "Example: “checking and savings at Big Bank; brokerage at Firm X” — no account numbers.",
      },
    ],
  },
  {
    id: "retirement",
    title: "Retirement / life insurance",
    description:
      "These assets usually stay in your name; the beneficiary form is the lever.",
    whyWeAsk:
      "Ask your attorney before naming the trust as beneficiary on an IRA or similar account.",
    fields: [
      {
        key: "retirementLifeInsuranceNotes",
        label: "Retirement and life insurance notes",
        type: "textarea",
        hint: "Usually stay in your name; beneficiary form is the lever — ask attorney before naming the trust on an IRA.",
      },
    ],
  },
  {
    id: "business",
    title: "Business interests",
    description:
      "Entity type and name. Flag whether an operating agreement may require consent to transfer.",
    fields: [
      {
        key: "businessName",
        label: "Business name",
        type: "text",
      },
      {
        key: "businessEntityType",
        label: "Entity type",
        type: "select",
        options: [
          { value: "sole_prop", label: "Sole proprietorship" },
          { value: "llc", label: "LLC" },
          { value: "s_corp", label: "S corporation" },
          { value: "partnership", label: "Partnership" },
          { value: "other", label: "Other" },
        ],
      },
      {
        key: "businessOperatingAgreementConsent",
        label:
          "Operating agreement / buy-sell may require consent to transfer into a trust?",
        type: "yesno",
        hint: "Flag this for your attorney — do not guess legal effect.",
      },
    ],
  },
  {
    id: "crypto",
    title: "Crypto / digital assets",
    description:
      "Never enter keys, seed phrases, or passwords. Point counsel to Digital Legacy notes instead.",
    fields: [
      {
        key: "cryptoDigitalNotes",
        label: "Digital asset notes (no secrets)",
        type: "textarea",
        hint: "Example: “self-custody wallet; instructions in Digital Legacy notes” — never paste keys or passwords.",
      },
    ],
  },
  {
    id: "pour_over",
    title: "Pour-over will",
    description:
      "Many people pair a living trust with a pour-over will to catch assets not yet funded into the trust.",
    whyWeAsk:
      "Use Will Planner for a companion pour-over draft your attorney can align with this trust plan.",
    fields: [
      {
        key: "wantsPourOverWill",
        label: "Do you want a pour-over will companion?",
        type: "yesno",
      },
      {
        key: "pourOverNotes",
        label: "Pour-over notes for your attorney",
        type: "textarea",
        showWhen: (a) => a.wantsPourOverWill === true,
      },
    ],
  },
  {
    id: "review",
    title: "Review & generate",
    description:
      "Check your answers, then generate a planning stub for your attorney. Residue percents must total 100% if you used specific shares.",
    fields: [],
  },
];

export function getTrustStep(id: TrustStepId): TrustStep | undefined {
  return TRUST_STEPS.find((s) => s.id === id);
}
