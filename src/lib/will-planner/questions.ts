/**
 * Will Planner interview answers + question catalog (client-safe).
 */

export type MaritalStatus =
  | "single"
  | "married"
  | "domestic_partner"
  | "separated"
  | "divorced"
  | "widowed";

export type ChildrenStatus = "none" | "adult_only" | "minors";

export type ChildRelation = "mine" | "spouse" | "both" | "adopted";

export type WillChildEntry = {
  name: string;
  dob?: string;
  relation?: ChildRelation;
};

export type WillGiftEntry = {
  item: string;
  recipient: string;
};

export type WillResidueShare = {
  name: string;
  percent: number | "";
};

export type WillRealEstateEntry = {
  address: string;
  whoShouldReceive: string;
};

export type ResidueMode =
  | "spouse_then_children"
  | "children_only"
  | "specific_percents"
  | "own_words";

export type RealEstateMode = "none" | "homestead_only" | "additional";

export type PetsMode = "none" | "caretaker";

export type DigitalExecutorMode = "same_as_executor" | "different";

export type BusinessEntityType =
  | "sole_prop"
  | "llc"
  | "s_corp"
  | "partnership"
  | "other";

export type CryptoHoldingType = "exchange" | "self_custody" | "both";

export type SituationPackId =
  | "employee"
  | "business"
  | "investor"
  | "crypto"
  | "complexity";

export type WillSituationPacks = {
  employee?: boolean;
  business?: boolean;
  investor?: boolean;
  crypto?: boolean;
  complexity?: boolean;
};

export type WillAnswers = {
  /** Wizard cursor — last step the user was on. */
  currentStepId?: string;

  /** Situation packs (optional packs unlock extra steps). */
  packs?: WillSituationPacks;

  // —— Always asked ——
  fullLegalName?: string;
  otherNamesUsed?: string;
  city?: string;
  county?: string;
  stateCode?: string;

  maritalStatus?: MaritalStatus;
  spouseLegalName?: string;
  hadPriorMarriages?: boolean;

  childrenStatus?: ChildrenStatus;
  children?: WillChildEntry[];

  guardianName?: string;
  guardianCity?: string;
  guardianRelationship?: string;
  alternateGuardianName?: string;
  alternateGuardianCity?: string;
  alternateGuardianRelationship?: string;

  executorName?: string;
  executorCity?: string;
  executorRelationship?: string;
  alternateExecutorName?: string;
  alternateExecutorCity?: string;
  alternateExecutorRelationship?: string;

  residueMode?: ResidueMode;
  residueShares?: WillResidueShare[];
  residueOwnWords?: string;

  specificGifts?: WillGiftEntry[];

  realEstateMode?: RealEstateMode;
  homesteadWhoShouldReceive?: string;
  additionalProperties?: WillRealEstateEntry[];

  petsMode?: PetsMode;
  petCaretakerName?: string;
  petCareAmount?: string;

  funeralWishes?: string;

  digitalExecutorMode?: DigitalExecutorMode;
  digitalExecutorName?: string;
  digitalExecutorCity?: string;
  digitalExecutorRelationship?: string;

  attorneyNotes?: string;

  // —— Pack A: employee ——
  employerName?: string;
  retirementPlansNotes?: string;
  lifeInsuranceNotes?: string;

  // —— Pack B: business ——
  businessEntityTypes?: BusinessEntityType[];
  businessName?: string;
  businessInterestRecipient?: string;
  businessOperationsManager?: string;
  hasOperatingOrBuySell?: boolean;
  businessTransitionContact?: string;

  // —— Pack C: investor ——
  brokerageNotes?: string;
  rentalProperties?: WillRealEstateEntry[];
  rentalManagerName?: string;

  // —— Pack D: crypto ——
  cryptoHoldingTypes?: CryptoHoldingType;
  cryptoInstructionsLocation?: string;
  cryptoAccessRequester?: string;

  // —— Pack E: complexity ——
  flagSpecialNeedsChild?: boolean;
  flagNonUsPropertyOrHeirs?: boolean;
  flagDisinherit?: boolean;
  disinheritName?: string;
  flagLivingTrust?: boolean;
  livingTrustNotes?: string;
};

export type WillStepId =
  | "packs"
  | "basics"
  | "family"
  | "children"
  | "guardians"
  | "executor"
  | "residue"
  | "gifts"
  | "real_estate"
  | "pets"
  | "funeral"
  | "digital_executor"
  | "employee"
  | "business"
  | "investor"
  | "crypto"
  | "complexity"
  | "notes"
  | "review";

export type WillFieldType =
  | "text"
  | "textarea"
  | "select"
  | "yesno"
  | "state"
  | "packs_checklist"
  | "children_list"
  | "gifts_list"
  | "residue_shares"
  | "real_estate_list"
  | "checkboxes";

export type WillField = {
  key: keyof WillAnswers;
  label: string;
  hint?: string;
  type: WillFieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  /** Hide unless answers match (evaluated in UI). */
  showWhen?: (answers: WillAnswers) => boolean;
};

export type WillStep = {
  id: WillStepId;
  title: string;
  description: string;
  /** Shown on business / retirement / crypto steps. */
  whyWeAsk?: string;
  fields: WillField[];
};

/** US states + DC for domicile. */
export const US_STATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

export const CHILD_RELATION_OPTIONS: Array<{
  value: ChildRelation;
  label: string;
}> = [
  { value: "mine", label: "Mine" },
  { value: "spouse", label: "Spouse’s" },
  { value: "both", label: "Both" },
  { value: "adopted", label: "Adopted" },
];

export const SITUATION_PACK_OPTIONS: Array<{
  id: SituationPackId;
  label: string;
  description: string;
}> = [
  {
    id: "employee",
    label: "W-2 / employee",
    description: "Employer retirement plans and life insurance",
  },
  {
    id: "business",
    label: "Business owner",
    description: "Entity ownership and who should run or inherit",
  },
  {
    id: "investor",
    label: "Investor / rental property",
    description: "Brokerage accounts and rentals",
  },
  {
    id: "crypto",
    label: "Crypto / digital assets",
    description: "Exchanges or self-custody — no keys or passwords",
  },
  {
    id: "complexity",
    label: "Higher complexity",
    description: "Special needs, non-US issues, disinheritance, living trust",
  },
];

export const WILL_STEPS: WillStep[] = [
  {
    id: "packs",
    title: "What applies to you?",
    description:
      "Optional situation packs add a few short questions. Skip any that don’t apply — a straightforward employee path stays short.",
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
    title: "About you",
    description: "Your legal identity and where you live.",
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
        label: "Other names used",
        type: "text",
        hint: "Maiden names, prior legal names, or common aliases (optional).",
      },
      {
        key: "city",
        label: "City",
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
    ],
  },
  {
    id: "family",
    title: "Marital status",
    description: "Family status helps an attorney frame gifts and elections.",
    fields: [
      {
        key: "maritalStatus",
        label: "Current status",
        type: "select",
        required: true,
        options: [
          { value: "single", label: "Single" },
          { value: "married", label: "Married" },
          { value: "domestic_partner", label: "Domestic partner" },
          { value: "separated", label: "Separated" },
          { value: "divorced", label: "Divorced" },
          { value: "widowed", label: "Widowed" },
        ],
      },
      {
        key: "spouseLegalName",
        label: "Spouse or partner’s legal name",
        type: "text",
        showWhen: (a) =>
          a.maritalStatus === "married" ||
          a.maritalStatus === "domestic_partner" ||
          a.maritalStatus === "separated",
      },
      {
        key: "hadPriorMarriages",
        label: "Prior marriages?",
        type: "yesno",
        required: true,
      },
    ],
  },
  {
    id: "children",
    title: "Children",
    description: "Whether you have children affects guardianship and residue options.",
    fields: [
      {
        key: "childrenStatus",
        label: "Children",
        type: "select",
        required: true,
        options: [
          { value: "none", label: "None" },
          { value: "adult_only", label: "Adult children only" },
          { value: "minors", label: "At least one minor child" },
        ],
      },
      {
        key: "children",
        label: "List each child",
        type: "children_list",
        showWhen: (a) =>
          a.childrenStatus === "adult_only" || a.childrenStatus === "minors",
        hint: "Name required. Date of birth and relation are optional but helpful.",
      },
    ],
  },
  {
    id: "guardians",
    title: "Guardians for minors",
    description:
      "Nominate who should care for minor children. A court still decides — this is your preference for counsel to formalize.",
    fields: [
      {
        key: "guardianName",
        label: "Preferred guardian — name",
        type: "text",
        required: true,
      },
      {
        key: "guardianCity",
        label: "City",
        type: "text",
      },
      {
        key: "guardianRelationship",
        label: "Relationship",
        type: "text",
      },
      {
        key: "alternateGuardianName",
        label: "Alternate guardian — name",
        type: "text",
        hint: "If the first choice cannot serve.",
      },
      {
        key: "alternateGuardianCity",
        label: "Alternate — city",
        type: "text",
      },
      {
        key: "alternateGuardianRelationship",
        label: "Alternate — relationship",
        type: "text",
      },
    ],
  },
  {
    id: "executor",
    title: "Personal representative",
    description:
      "Who should carry out your wishes (often called an executor or personal representative)?",
    fields: [
      {
        key: "executorName",
        label: "Primary — name",
        type: "text",
        required: true,
      },
      {
        key: "executorCity",
        label: "Primary — city",
        type: "text",
      },
      {
        key: "executorRelationship",
        label: "Primary — relationship",
        type: "text",
      },
      {
        key: "alternateExecutorName",
        label: "Alternate — name",
        type: "text",
      },
      {
        key: "alternateExecutorCity",
        label: "Alternate — city",
        type: "text",
      },
      {
        key: "alternateExecutorRelationship",
        label: "Alternate — relationship",
        type: "text",
      },
    ],
  },
  {
    id: "residue",
    title: "Residuary estate",
    description:
      "After specific gifts and debts, who should receive what remains?",
    fields: [
      {
        key: "residueMode",
        label: "How should the residue be divided?",
        type: "select",
        required: true,
        options: [
          {
            value: "spouse_then_children",
            label: "All to spouse, then children equally",
          },
          { value: "children_only", label: "Children only, equally" },
          {
            value: "specific_percents",
            label: "Specific people + percents (must total 100%)",
          },
          { value: "own_words", label: "Describe in my own words" },
        ],
      },
      {
        key: "residueShares",
        label: "People and percents",
        type: "residue_shares",
        showWhen: (a) => a.residueMode === "specific_percents",
        hint: "Percents must add up to exactly 100 before you can build the draft.",
      },
      {
        key: "residueOwnWords",
        label: "Describe the residue plan",
        type: "textarea",
        showWhen: (a) => a.residueMode === "own_words",
        required: true,
      },
    ],
  },
  {
    id: "gifts",
    title: "Specific gifts",
    description: "Optional — particular items or cash amounts for named people.",
    fields: [
      {
        key: "specificGifts",
        label: "Specific gifts",
        type: "gifts_list",
        hint: "Skip if everything should follow the residue plan.",
      },
    ],
  },
  {
    id: "real_estate",
    title: "Real estate",
    description:
      "Deeds, titles, and how property is held often control — note preferences for your attorney.",
    fields: [
      {
        key: "realEstateMode",
        label: "Real estate",
        type: "select",
        required: true,
        options: [
          { value: "none", label: "None" },
          { value: "homestead_only", label: "Homestead / primary home only" },
          { value: "additional", label: "Additional properties" },
        ],
      },
      {
        key: "homesteadWhoShouldReceive",
        label: "Who should receive the homestead (preference)?",
        type: "text",
        showWhen: (a) =>
          a.realEstateMode === "homestead_only" ||
          a.realEstateMode === "additional",
        hint: "Reminder: deeds and titles may control over a will.",
      },
      {
        key: "additionalProperties",
        label: "Additional properties",
        type: "real_estate_list",
        showWhen: (a) => a.realEstateMode === "additional",
        hint: "Address + who should receive (preference). Deeds/titles may control.",
      },
    ],
  },
  {
    id: "pets",
    title: "Pets",
    description: "Optional caretaker and care funds for companion animals.",
    fields: [
      {
        key: "petsMode",
        label: "Pets",
        type: "select",
        required: true,
        options: [
          { value: "none", label: "None / not needed" },
          { value: "caretaker", label: "Name a caretaker" },
        ],
      },
      {
        key: "petCaretakerName",
        label: "Caretaker name",
        type: "text",
        showWhen: (a) => a.petsMode === "caretaker",
        required: true,
      },
      {
        key: "petCareAmount",
        label: "Optional dollar amount for care",
        type: "text",
        showWhen: (a) => a.petsMode === "caretaker",
        hint: "Example: $2,000 for food and veterinary care.",
      },
    ],
  },
  {
    id: "funeral",
    title: "Funeral wishes",
    description: "Burial, cremation, or ceremony preferences.",
    fields: [
      {
        key: "funeralWishes",
        label: "Wishes",
        type: "textarea",
        hint: "Wishes, not binding in every state. Optional.",
      },
    ],
  },
  {
    id: "digital_executor",
    title: "Digital executor",
    description:
      "Who may request vault or legacy access after death. Do not write passwords here.",
    fields: [
      {
        key: "digitalExecutorMode",
        label: "Digital executor",
        type: "select",
        required: true,
        options: [
          { value: "same_as_executor", label: "Same as personal representative" },
          { value: "different", label: "Different person" },
        ],
        hint: "This person may request vault/legacy access; do not write passwords here.",
      },
      {
        key: "digitalExecutorName",
        label: "Name",
        type: "text",
        showWhen: (a) => a.digitalExecutorMode === "different",
        required: true,
      },
      {
        key: "digitalExecutorCity",
        label: "City",
        type: "text",
        showWhen: (a) => a.digitalExecutorMode === "different",
      },
      {
        key: "digitalExecutorRelationship",
        label: "Relationship",
        type: "text",
        showWhen: (a) => a.digitalExecutorMode === "different",
      },
    ],
  },
  {
    id: "employee",
    title: "Employment & benefits",
    description: "Retirement plans and life insurance through work.",
    whyWeAsk:
      "Why we ask: Beneficiary forms on 401(k), 403(b), IRA, and life insurance usually control those accounts — a will typically does not. Your attorney will want to know what exists so designations stay coordinated.",
    fields: [
      {
        key: "employerName",
        label: "Employer",
        type: "text",
      },
      {
        key: "retirementPlansNotes",
        label: "Retirement plans (401k / 403b / IRA)",
        type: "textarea",
        hint: "Name beneficiaries ON THE ACCOUNT. The will usually does not control those.",
      },
      {
        key: "lifeInsuranceNotes",
        label: "Life insurance",
        type: "textarea",
        hint: "Same warning: name beneficiaries on the policy; the will usually does not control.",
      },
    ],
  },
  {
    id: "business",
    title: "Business interests",
    description: "Who should receive ownership vs who should run day-to-day.",
    whyWeAsk:
      "Why we ask: Business succession often needs operating agreements or buy-sell documents. A will alone is frequently not enough — these notes help your attorney see the gaps.",
    fields: [
      {
        key: "businessEntityTypes",
        label: "Entity type(s)",
        type: "checkboxes",
        options: [
          { value: "sole_prop", label: "Sole proprietorship" },
          { value: "llc", label: "LLC" },
          { value: "s_corp", label: "S-corp" },
          { value: "partnership", label: "Partnership" },
          { value: "other", label: "Other" },
        ],
      },
      {
        key: "businessName",
        label: "Business name",
        type: "text",
      },
      {
        key: "businessInterestRecipient",
        label: "Who should receive the ownership interest?",
        type: "text",
      },
      {
        key: "businessOperationsManager",
        label: "Who should run operations?",
        type: "text",
        hint: "May be different from who inherits the interest.",
      },
      {
        key: "hasOperatingOrBuySell",
        label: "Do you have an operating agreement or buy-sell?",
        type: "yesno",
        required: true,
      },
      {
        key: "businessTransitionContact",
        label: "Business transition contact (optional)",
        type: "text",
        hint: "Attorney, accountant, or manager who knows the business.",
      },
    ],
  },
  {
    id: "investor",
    title: "Investments & rentals",
    description: "Brokerage accounts and rental properties.",
    whyWeAsk:
      "Why we ask: Taxable brokerage accounts and TOD/POD designations may pass outside a will. Rentals need both inheritance and day-to-day management notes.",
    fields: [
      {
        key: "brokerageNotes",
        label: "Brokerage / taxable accounts",
        type: "textarea",
        hint: "Reminder: account beneficiary designations often control instead of the will.",
      },
      {
        key: "rentalProperties",
        label: "Rental properties",
        type: "real_estate_list",
        hint: "Address + who should inherit (preference).",
      },
      {
        key: "rentalManagerName",
        label: "Who should manage rentals?",
        type: "text",
        hint: "May differ from who inherits.",
      },
    ],
  },
  {
    id: "crypto",
    title: "Crypto & digital assets",
    description:
      "Never enter seed phrases, private keys, or passwords in this planner.",
    whyWeAsk:
      "Why we ask: Crypto access is practical, not just legal. Putting keys in a will can expose them in probate. Point counsel to private notes instead.",
    fields: [
      {
        key: "cryptoHoldingTypes",
        label: "Types held",
        type: "select",
        options: [
          { value: "exchange", label: "Exchange accounts" },
          { value: "self_custody", label: "Self-custody" },
          { value: "both", label: "Both" },
        ],
      },
      {
        key: "cryptoInstructionsLocation",
        label: "Where do access instructions live?",
        type: "textarea",
        hint: "Prompt: store details in Digital Legacy private notes / Secure Items — not in this draft.",
      },
      {
        key: "cryptoAccessRequester",
        label: "Who may request access after death?",
        type: "text",
      },
    ],
  },
  {
    id: "complexity",
    title: "Higher complexity",
    description: "Optional flags so your attorney sees sensitive topics early.",
    fields: [
      {
        key: "flagSpecialNeedsChild",
        label: "Child with special needs",
        type: "yesno",
        hint: "Ask attorney about a supplemental needs trust; do not leave a large outright gift in this draft.",
      },
      {
        key: "flagNonUsPropertyOrHeirs",
        label: "Non-US property or non-US heirs",
        type: "yesno",
      },
      {
        key: "flagDisinherit",
        label: "Want to disinherit someone",
        type: "yesno",
        hint: "Attorney must draft this carefully.",
      },
      {
        key: "disinheritName",
        label: "Name of person (for counsel)",
        type: "text",
        showWhen: (a) => a.flagDisinherit === true,
      },
      {
        key: "flagLivingTrust",
        label: "Already have a living trust",
        type: "yesno",
        hint: "We’ll generate pour-over style notes — not a fake trust document.",
      },
      {
        key: "livingTrustNotes",
        label: "Trust notes for counsel",
        type: "textarea",
        showWhen: (a) => a.flagLivingTrust === true,
        hint: "Where documents are kept, trustee name, date if known.",
      },
    ],
  },
  {
    id: "notes",
    title: "Anything else?",
    description: "Free text for your attorney.",
    fields: [
      {
        key: "attorneyNotes",
        label: "Anything you want an attorney to know",
        type: "textarea",
      },
    ],
  },
  {
    id: "review",
    title: "Review & build draft",
    description:
      "Check your answers, then build a plain-language attorney draft. You can jump back to any section.",
    fields: [],
  },
];

export function getWillStep(id: WillStepId): WillStep | undefined {
  return WILL_STEPS.find((s) => s.id === id);
}

export function hasMinors(answers: WillAnswers): boolean {
  return answers.childrenStatus === "minors";
}

export function hasAnyChildren(answers: WillAnswers): boolean {
  return (
    answers.childrenStatus === "adult_only" ||
    answers.childrenStatus === "minors"
  );
}
