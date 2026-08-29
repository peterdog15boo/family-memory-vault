/**
 * Educational will-signing guidance by US state / DC.
 *
 * This is NOT legal advice and must never be presented as making a draft “executed.”
 * No statute numbers in UI copy. Optional comments below are for maintainers only.
 */

export type WillWitnessModel = "two" | "two_plus_notary" | "attorney";

export type WillNotaryOnWill =
  | "not_required"
  | "required_notarial"
  | "optional_alternative";

export type WillSelfProving =
  | "recommended"
  | "available"
  | "limited"
  | "different_procedure";

export type WillHolographic =
  | "recognized_not_recommended"
  | "not_typical";

export type WillEWills = "generally_no" | "maybe_ask_attorney";

export type WillExecutionByState = {
  stateCode: string;
  minAgeNote: string;
  witnesses: WillWitnessModel;
  notaryOnWill: WillNotaryOnWill;
  selfProving: WillSelfProving;
  holographic: WillHolographic;
  eWills: WillEWills;
  communityProperty: boolean;
  /** 4–7 short checklist lines for the Signing panel. */
  bullets: string[];
  caution?: string;
};

/** Shown once for every state (educational). */
export const WILL_UNIVERSAL_WITNESS_GUIDANCE: string[] = [
  "Use adults who do not inherit under the draft.",
  "Spouse and children who take gifts are a bad choice as witnesses.",
  "Same room, same time — everyone present together.",
  "Do not initial changes after signing; go back to the attorney.",
];

export const WILL_SIGNING_PANEL_DISCLAIMER =
  "This is a planning draft. It is not a will. Your attorney licensed in this state must prepare the signing ceremony.";

const COMMUNITY_PROPERTY = new Set([
  "AZ",
  "CA",
  "ID",
  "LA",
  "NV",
  "NM",
  "TX",
  "WA",
  "WI",
]);

const COMMUNITY_BULLET =
  "A will usually cannot give away your spouse’s share of community property.";

function withCommunity(bullets: string[], stateCode: string): string[] {
  if (!COMMUNITY_PROPERTY.has(stateCode)) return bullets;
  if (bullets.includes(COMMUNITY_BULLET)) return bullets;
  return [...bullets, COMMUNITY_BULLET];
}

/**
 * Conservative default: two adult disinterested witnesses, same session;
 * notary not required on the will; self-proving recommended; e-wills generally_no;
 * holographic not_typical.
 */
function defaultExecution(
  stateCode: string,
  overrides: Partial<Omit<WillExecutionByState, "stateCode" | "bullets">> & {
    bullets?: string[];
  } = {},
): WillExecutionByState {
  const baseBullets = overrides.bullets ?? [
    "Two adult witnesses who do not take under the will.",
    "Sign in the same room, at the same sitting, in each other’s presence.",
    "A notary is usually not required on the will itself.",
    "Ask your attorney about a self-proving affidavit at the signing.",
    "Do not treat this PDF as a finished will.",
  ];

  const communityProperty =
    overrides.communityProperty ?? COMMUNITY_PROPERTY.has(stateCode);

  return {
    stateCode,
    minAgeNote: overrides.minAgeNote ?? "Use adult witnesses (18+).",
    witnesses: overrides.witnesses ?? "two",
    notaryOnWill: overrides.notaryOnWill ?? "not_required",
    selfProving: overrides.selfProving ?? "recommended",
    holographic: overrides.holographic ?? "not_typical",
    eWills: overrides.eWills ?? "generally_no",
    communityProperty,
    bullets: withCommunity(baseBullets, stateCode),
    caution: overrides.caution,
  };
}

/** Explicit outlier / UPC-notary-alternative cards. */
const OUTLIERS: Record<string, WillExecutionByState> = {
  // TX — Estates Code style self-proving; notary ≠ witness; holographic allowed but not recommended
  TX: {
    stateCode: "TX",
    minAgeNote:
      "Texas allows credible witnesses 14+, but use adults (18+) anyway.",
    witnesses: "two",
    notaryOnWill: "not_required",
    selfProving: "recommended",
    holographic: "recognized_not_recommended",
    eWills: "generally_no",
    communityProperty: true,
    bullets: [
      "Two credible witnesses — use adults even though 14+ is the statutory floor.",
      "Sign in the testator’s presence, same sitting.",
      "A notary is NOT a substitute for the two witnesses.",
      "Strongly recommend a Texas self-proving affidavit (Estates Code style) at the signing.",
      "Holographic wills (wholly handwritten) may be allowed — do not recommend that path.",
      COMMUNITY_BULLET,
    ],
    caution:
      "Beneficiary designations and community property can override what this draft says.",
  },

  // LA — civil-law notarial / olographic; not a simple two-witness common-law will
  LA: {
    stateCode: "LA",
    minAgeNote: "Follow your Louisiana attorney’s directions for capacity and form.",
    witnesses: "attorney",
    notaryOnWill: "required_notarial",
    selfProving: "different_procedure",
    holographic: "recognized_not_recommended",
    eWills: "generally_no",
    communityProperty: true,
    bullets: [
      "Louisiana is not a typical common-law two-witness will state.",
      "Notarial testament: notary + two witnesses — your attorney must run this.",
      "Olographic form (fully handwritten, dated, and signed) is a different path; do not DIY it from this draft.",
      "Attorney-required language and formalities apply — do not treat this PDF as executable.",
      COMMUNITY_BULLET,
    ],
    caution:
      "Do not attempt a simple attested “two witnesses only” signing for Louisiana from this draft.",
  },

  // PA — still recommend two witnesses; never say “no witnesses required”
  PA: {
    stateCode: "PA",
    minAgeNote: "Use adult witnesses (18+).",
    witnesses: "two",
    notaryOnWill: "not_required",
    selfProving: "available",
    holographic: "not_typical",
    eWills: "generally_no",
    communityProperty: false,
    bullets: [
      "Still recommend two adult witnesses plus your attorney.",
      "Do not rely on informal or unwitnessed execution.",
      "Sign together in the same session as your attorney directs.",
      "Ask about self-proving formalities at the signing.",
      "Do not treat this PDF as a finished will.",
    ],
  },

  // CO / ND / UT — UPC-style notary acknowledgment as possible alternative
  CO: defaultExecution("CO", {
    notaryOnWill: "optional_alternative",
    bullets: [
      "Some states allow acknowledgment before a notary instead of two witnesses.",
      "Ask your attorney which method to use. Do not skip counsel.",
      "If using witnesses, prefer two adults who do not inherit, same sitting.",
      "Ask about a self-proving affidavit when that method applies.",
      "Do not treat this PDF as a finished will.",
    ],
  }),
  ND: defaultExecution("ND", {
    notaryOnWill: "optional_alternative",
    bullets: [
      "Some states allow acknowledgment before a notary instead of two witnesses.",
      "Ask your attorney which method to use. Do not skip counsel.",
      "If using witnesses, prefer two adults who do not inherit, same sitting.",
      "Ask about a self-proving affidavit when that method applies.",
      "Do not treat this PDF as a finished will.",
    ],
  }),
  UT: defaultExecution("UT", {
    notaryOnWill: "optional_alternative",
    bullets: [
      "Some states allow acknowledgment before a notary instead of two witnesses.",
      "Ask your attorney which method to use. Do not skip counsel.",
      "If using witnesses, prefer two adults who do not inherit, same sitting.",
      "Ask about a self-proving affidavit when that method applies.",
      "Do not treat this PDF as a finished will.",
    ],
  }),

  // CA — two witnesses; notary ≠ witnesses; holographic recognized; CP
  CA: {
    stateCode: "CA",
    minAgeNote: "Use adult witnesses (18+).",
    witnesses: "two",
    notaryOnWill: "not_required",
    selfProving: "different_procedure",
    holographic: "recognized_not_recommended",
    eWills: "generally_no",
    communityProperty: true,
    bullets: [
      "Two witnesses present at the same time.",
      "A notary does not replace the witnesses.",
      "Self-proving is not the usual UPC affidavit-at-signing model — ask your California attorney.",
      "Holographic wills may be recognized — not recommended; use lawyer-supervised signing.",
      COMMUNITY_BULLET,
      "Do not treat this PDF as a finished will.",
    ],
  },

  // FL
  FL: {
    stateCode: "FL",
    minAgeNote: "Use adult witnesses (18+).",
    witnesses: "two",
    notaryOnWill: "not_required",
    selfProving: "recommended",
    holographic: "not_typical",
    eWills: "maybe_ask_attorney",
    communityProperty: false,
    bullets: [
      "Two witnesses, typically all present together.",
      "Self-proving affidavit is recommended at the signing.",
      "Holographic wills are not the typical Florida path.",
      "Your state may allow electronic execution — ask counsel; do not DocuSign this PDF as a will.",
      "Do not treat this PDF as a finished will.",
    ],
  },

  // NY
  NY: {
    stateCode: "NY",
    minAgeNote: "Use adult witnesses (18+).",
    witnesses: "two",
    notaryOnWill: "not_required",
    selfProving: "available",
    holographic: "not_typical",
    eWills: "generally_no",
    communityProperty: false,
    bullets: [
      "Two adult witnesses in the manner your New York attorney directs.",
      "Holographic wills are not the typical New York path.",
      "Electronic wills: generally not available for this draft — do not assume e-signing works.",
      "Ask about self-proving or affidavit formalities at the ceremony.",
      "Do not treat this PDF as a finished will.",
    ],
  },

  // OH / MD — limited self-proving
  OH: defaultExecution("OH", {
    selfProving: "limited",
    bullets: [
      "Two adult witnesses who do not take under the will.",
      "Sign in the same room, at the same sitting.",
      "Self-proving options may be limited in this state.",
      "Ask your attorney how this state proves a will at probate.",
      "Do not treat this PDF as a finished will.",
    ],
  }),
  MD: defaultExecution("MD", {
    selfProving: "limited",
    bullets: [
      "Two adult witnesses who do not take under the will.",
      "Sign in the same room, at the same sitting.",
      "Self-proving options may be limited in this state.",
      "Ask your attorney how this state proves a will at probate.",
      "Do not treat this PDF as a finished will.",
    ],
  }),
};

const ALL_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

function buildTable(): Record<string, WillExecutionByState> {
  const table: Record<string, WillExecutionByState> = {};
  for (const code of ALL_CODES) {
    table[code] = OUTLIERS[code] ?? defaultExecution(code);
  }
  return table;
}

export const WILL_EXECUTION_BY_STATE: Record<string, WillExecutionByState> =
  buildTable();

/** Conservative default card when domicile is not set. */
export const WILL_EXECUTION_DEFAULT: WillExecutionByState = defaultExecution(
  "DEFAULT",
  {
    communityProperty: false,
    bullets: [
      "Two adult witnesses who do not take under the will.",
      "Sign in the same room, at the same sitting, in each other’s presence.",
      "A notary is usually not required on the will itself.",
      "Ask your attorney about a self-proving affidavit if your state allows it.",
      "Set your state of domicile so we can show state-specific signing notes.",
      "Do not treat this PDF as a finished will.",
    ],
  },
);

export function getWillExecutionForState(
  stateCode: string | null | undefined,
): WillExecutionByState {
  const code = stateCode?.trim().toUpperCase();
  if (!code) return WILL_EXECUTION_DEFAULT;
  return WILL_EXECUTION_BY_STATE[code] ?? WILL_EXECUTION_DEFAULT;
}

export function willExecutionStateLabel(
  stateCode: string | null | undefined,
): string {
  if (!stateCode?.trim()) return "your state";
  const labels: Record<string, string> = {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    DC: "District of Columbia",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
  };
  const code = stateCode.trim().toUpperCase();
  return labels[code] ?? code;
}

/** Short bullets for the domicile step (2–3 lines). */
export function willExecutionShortBullets(
  info: WillExecutionByState,
): string[] {
  if (info.stateCode === "LA") {
    return [
      "Louisiana uses notarial or olographic forms — not a simple two-witness will.",
      "Your attorney must run the signing ceremony.",
    ];
  }
  if (info.notaryOnWill === "optional_alternative") {
    return [
      "Two witnesses is the common path; some states allow a notary acknowledgment instead.",
      "Ask your attorney which method to use.",
    ];
  }
  return [
    "Typically two adult witnesses, same sitting.",
    info.selfProving === "recommended"
      ? "A self-proving affidavit is often recommended at signing."
      : "Ask your attorney how wills are proved at probate here.",
  ];
}
