import type { LinkedAccountCategory } from "@/lib/plaid/categories";

export type LinkedAccountHoldingView = {
  id: string;
  name: string;
  ticker: string | null;
  quantity: number | null;
  value: number | null;
  price: number | null;
  currency: string | null;
  asOf: string | null;
};

export type LinkedAccountView = {
  id: string;
  plaidItemId: string;
  institutionName: string | null;
  name: string;
  officialName: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  category: LinkedAccountCategory;
  categoryManual: boolean;
  currentBalance: number | null;
  availableBalance: number | null;
  currency: string | null;
  notes: string | null;
  lastSyncedAt: string | null;
  holdings: LinkedAccountHoldingView[];
};

export type PlaidItemView = {
  id: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  accountCount: number;
  createdAt: string;
};

export type ConnectedAccountsPageData = {
  configured: boolean;
  /** Plaid environment — sandbox needs seeded test phone numbers. */
  env: "sandbox" | "development" | "production" | "unknown";
  items: PlaidItemView[];
  accounts: LinkedAccountView[];
};
