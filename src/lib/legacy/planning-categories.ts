/**
 * Configurable Legacy Planning checklist.
 * Weights sum to 100. Edit this catalog to add/rename categories.
 */

export const LEGACY_PLANNING_SENSITIVITIES = [
  "owner_only",
  "emergency_ok",
] as const;

export type LegacyPlanningSensitivity =
  (typeof LEGACY_PLANNING_SENSITIVITIES)[number];

export type LegacyPlanningCategoryId =
  | "banking"
  | "credit"
  | "insurance"
  | "investments"
  | "legal_docs"
  | "contacts"
  | "digital_assets"
  | "property"
  | "final_wishes";

export type LegacyPlanningCategoryDef = {
  id: LegacyPlanningCategoryId;
  title: string;
  description: string;
  /** Share of completeness (all weights sum to 100). */
  weight: number;
  /** Suggested first-item title. */
  suggestedTitle: string;
  /** Field guidance — never ask for full account numbers or passwords. */
  fieldsHint: string;
  /** Optional deep link into the existing Digital Legacy vault. */
  vaultHref?: string;
  vaultLabel?: string;
  defaultSensitivity: LegacyPlanningSensitivity;
};

export const LEGACY_PLANNING_CATEGORIES: readonly LegacyPlanningCategoryDef[] = [
  {
    id: "banking",
    title: "Banking & Financial Accounts",
    description: "Checking, savings, and everyday money accounts.",
    weight: 12,
    suggestedTitle: "Primary checking account",
    fieldsHint:
      "Institution name, last four digits, and where statements live — never the full account number.",
    vaultHref: "/documents/legacy/practical",
    vaultLabel: "Practical instructions",
    defaultSensitivity: "emergency_ok",
  },
  {
    id: "credit",
    title: "Credit Cards & Loans",
    description: "Cards, mortgages, auto loans, and other balances.",
    weight: 8,
    suggestedTitle: "Primary credit card",
    fieldsHint: "Lender name, last four, and how the bill is usually paid.",
    vaultHref: "/documents/legacy/practical",
    vaultLabel: "Practical instructions",
    defaultSensitivity: "emergency_ok",
  },
  {
    id: "insurance",
    title: "Insurance Policies (life, health, home, auto)",
    description: "Policies someone may need to find quickly.",
    weight: 12,
    suggestedTitle: "Life insurance policy",
    fieldsHint: "Carrier, policy type, and where the paperwork is kept.",
    vaultHref: "/documents/legacy/practical",
    vaultLabel: "Practical instructions",
    defaultSensitivity: "emergency_ok",
  },
  {
    id: "investments",
    title: "Investment & Retirement Accounts",
    description: "Brokerage, 401(k), IRA, and similar accounts.",
    weight: 12,
    suggestedTitle: "Retirement account",
    fieldsHint: "Firm name, account type, and who the advisor is — not login details.",
    vaultHref: "/documents/legacy/practical",
    vaultLabel: "Practical instructions",
    defaultSensitivity: "owner_only",
  },
  {
    id: "legal_docs",
    title: "Legal Documents (will, trust, POA, advance directive)",
    description: "Estate papers and where the originals live.",
    weight: 14,
    suggestedTitle: "Last will and testament",
    fieldsHint: "Document type, attorney, and physical or vault location.",
    vaultHref: "/documents/legacy/practical",
    vaultLabel: "Legal notes",
    defaultSensitivity: "emergency_ok",
  },
  {
    id: "contacts",
    title: "Important Contacts & Professionals",
    description: "Attorney, accountant, executor, and people to call first.",
    weight: 10,
    suggestedTitle: "Estate attorney",
    fieldsHint: "Name, role, and how to reach them.",
    vaultHref: "/documents/legacy/contacts",
    vaultLabel: "Key contacts",
    defaultSensitivity: "emergency_ok",
  },
  {
    id: "digital_assets",
    title: "Digital Assets & Passwords",
    description: "Password manager, email, domains — link the secure vault, don’t paste secrets here.",
    weight: 12,
    suggestedTitle: "Password manager",
    fieldsHint:
      "Where the password manager lives and who may request emergency access. Store passwords in Secure Items.",
    vaultHref: "/documents/legacy/secure",
    vaultLabel: "Secure items",
    defaultSensitivity: "owner_only",
  },
  {
    id: "property",
    title: "Property & Vehicles",
    description: "Homes, land, cars, and titles.",
    weight: 10,
    suggestedTitle: "Primary home",
    fieldsHint: "Address or description, title location, and any loan on the property.",
    vaultHref: "/documents/legacy/practical",
    vaultLabel: "Home & personal",
    defaultSensitivity: "emergency_ok",
  },
  {
    id: "final_wishes",
    title: "Final Wishes & Memorial Preferences",
    description: "Services, burial or cremation, and how you’d like to be remembered.",
    weight: 10,
    suggestedTitle: "Memorial preferences",
    fieldsHint: "Wishes in your own words. A longer letter lives in Message to Loved Ones.",
    vaultHref: "/documents/legacy/message",
    vaultLabel: "Message to loved ones",
    defaultSensitivity: "emergency_ok",
  },
] as const;

const WEIGHT_SUM = LEGACY_PLANNING_CATEGORIES.reduce((sum, c) => sum + c.weight, 0);

export const LEGACY_PLANNING_CATEGORY_IDS = LEGACY_PLANNING_CATEGORIES.map(
  (c) => c.id,
) as [LegacyPlanningCategoryId, ...LegacyPlanningCategoryId[]];

export function planningCategoryById(
  id: string,
): LegacyPlanningCategoryDef | undefined {
  return LEGACY_PLANNING_CATEGORIES.find((c) => c.id === id);
}

export function assertPlanningWeights(): void {
  if (WEIGHT_SUM !== 100) {
    throw new Error(
      `LEGACY_PLANNING_CATEGORIES weights must sum to 100 (got ${WEIGHT_SUM}).`,
    );
  }
}

/** Documentation bonus as a fraction of category weight. */
export const LEGACY_PLANNING_DOC_BONUS_RATIO = 0.25;
