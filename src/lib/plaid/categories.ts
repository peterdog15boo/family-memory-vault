/**
 * Digital Legacy / Connected Accounts category mapping from Plaid type+subtype.
 * Prefer "other" when ambiguous — never force a wrong bucket.
 */

export const LINKED_ACCOUNT_CATEGORIES = [
  "banking",
  "investments",
  "loans_debt",
  "credit_cards",
  "insurance_benefits",
  "other",
] as const;

export type LinkedAccountCategory = (typeof LINKED_ACCOUNT_CATEGORIES)[number];

export const LINKED_ACCOUNT_CATEGORY_LABELS: Record<
  LinkedAccountCategory,
  string
> = {
  banking: "Banking",
  investments: "Investments",
  loans_debt: "Loans & Debt",
  credit_cards: "Credit Cards",
  insurance_benefits: "Insurance & Benefits",
  other: "Other",
};

/** Display order for grouped sections. */
export const LINKED_ACCOUNT_CATEGORY_ORDER: LinkedAccountCategory[] = [
  "banking",
  "investments",
  "credit_cards",
  "loans_debt",
  "insurance_benefits",
  "other",
];

const BANKING_SUBTYPES = new Set([
  "checking",
  "savings",
  "money market",
  "cd",
  "certificate of deposit",
  "cash management",
  "prepaid",
  "paypal",
  "ebt",
]);

const INVESTMENT_SUBTYPES = new Set([
  "brokerage",
  "ira",
  "roth",
  "roth 401k",
  "401k",
  "401a",
  "403b",
  "457b",
  "529",
  "mutual fund",
  "pension",
  "profit sharing plan",
  "retirement",
  "sep ira",
  "simple ira",
  "stock plan",
  "trust",
  "ugma",
  "utma",
  "education savings account",
  "fixed annuity",
  "variable annuity",
  "non-taxable brokerage account",
  "crypto exchange",
  "sarsep",
  "keogh",
  "tfsa",
  "rrsp",
  "rrif",
  "lira",
  "lif",
  "lrsp",
  "lrif",
  "prif",
  "rdsp",
  "resp",
  "rlif",
  "sipp",
  "isa",
  "cash isa",
  "gic",
  "qshr",
]);

const LOAN_SUBTYPES = new Set([
  "student",
  "mortgage",
  "auto",
  "home equity",
  "line of credit",
  "personal",
  "consumer",
  "business",
  "commercial",
  "construction",
  "loan",
  "overdraft",
  "other",
]);

const INSURANCE_BENEFITS_SUBTYPES = new Set([
  "hsa",
  "fsa",
  "health reimbursement arrangement",
  "life insurance",
  "other insurance",
  "disability",
  "insurance",
]);

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Map Plaid account type + subtype → Legacy category.
 * Ambiguous inputs become `other`.
 */
export function categorizePlaidAccount(
  type: string | null | undefined,
  subtype: string | null | undefined,
): LinkedAccountCategory {
  const t = norm(type);
  const s = norm(subtype);

  if (!t && !s) return "other";

  // Explicit insurance / benefits subtypes first (Plaid may put HSA under depository).
  if (INSURANCE_BENEFITS_SUBTYPES.has(s)) {
    return "insurance_benefits";
  }

  if (t === "credit" || s === "credit card" || s === "credit") {
    return "credit_cards";
  }

  if (t === "loan" || LOAN_SUBTYPES.has(s)) {
    // "other" loan subtype still means a loan.
    if (t === "loan") return "loans_debt";
    if (LOAN_SUBTYPES.has(s) && s !== "other") return "loans_debt";
  }

  if (t === "investment") {
    if (s === "other insurance" || s === "life insurance") {
      return "insurance_benefits";
    }
    // Unknown investment subtypes still belong under Investments.
    return "investments";
  }

  if (INVESTMENT_SUBTYPES.has(s)) {
    return "investments";
  }

  if (t === "depository") {
    if (BANKING_SUBTYPES.has(s) || !s || s === "other") {
      // Empty/"other" depository → Banking (standard cash accounts).
      return "banking";
    }
    // Unrecognized depository subtype → Other (safer than wrong bucket).
    return "other";
  }

  if (BANKING_SUBTYPES.has(s)) {
    return "banking";
  }

  if (t === "other") {
    if (s.includes("insurance") || s.includes("benefit")) {
      return "insurance_benefits";
    }
    return "other";
  }

  return "other";
}

export function isLinkedAccountCategory(
  value: unknown,
): value is LinkedAccountCategory {
  return (
    typeof value === "string" &&
    (LINKED_ACCOUNT_CATEGORIES as readonly string[]).includes(value)
  );
}

export function groupAccountsByCategory<T extends { category: LinkedAccountCategory }>(
  accounts: T[],
): Array<{ category: LinkedAccountCategory; accounts: T[] }> {
  const buckets = new Map<LinkedAccountCategory, T[]>();
  for (const cat of LINKED_ACCOUNT_CATEGORY_ORDER) {
    buckets.set(cat, []);
  }
  for (const account of accounts) {
    const cat = isLinkedAccountCategory(account.category)
      ? account.category
      : "other";
    buckets.get(cat)!.push(account);
  }
  return LINKED_ACCOUNT_CATEGORY_ORDER.filter(
    (cat) => (buckets.get(cat)?.length ?? 0) > 0,
  ).map((category) => ({
    category,
    accounts: buckets.get(category)!,
  }));
}
