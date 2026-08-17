/**
 * Plaid env + product configuration. Secrets stay server-side only.
 */

import { z } from "zod";
import { CountryCode, Products } from "plaid";

const plaidEnvSchema = z.enum(["sandbox", "development", "production"]);

export type PlaidEnvName = z.infer<typeof plaidEnvSchema>;

export function isPlaidConfigured(): boolean {
  return Boolean(
    process.env.PLAID_CLIENT_ID?.trim() &&
      process.env.PLAID_SECRET?.trim() &&
      process.env.PLAID_TOKEN_ENCRYPTION_KEY?.trim(),
  );
}

export function getPlaidEnv(): PlaidEnvName {
  const parsed = plaidEnvSchema.safeParse(
    (process.env.PLAID_ENV ?? "sandbox").trim().toLowerCase(),
  );
  return parsed.success ? parsed.data : "sandbox";
}

export function getPlaidCredentials(): {
  clientId: string;
  secret: string;
  env: PlaidEnvName;
} {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error(
      "Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.",
    );
  }
  return { clientId, secret, env: getPlaidEnv() };
}

const PRODUCT_MAP: Record<string, Products> = {
  transactions: Products.Transactions,
  investments: Products.Investments,
  auth: Products.Auth,
  identity: Products.Identity,
  liabilities: Products.Liabilities,
  assets: Products.Assets,
};

/** Default: balances via transactions + investment holdings. */
export function getPlaidProducts(): Products[] {
  const raw =
    process.env.PLAID_PRODUCTS?.trim() || "transactions,investments";
  const products = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .map((p) => PRODUCT_MAP[p])
    .filter((p): p is Products => Boolean(p));

  if (products.length === 0) {
    return [Products.Transactions, Products.Investments];
  }
  return [...new Set(products)];
}

export function getPlaidCountryCodes(): CountryCode[] {
  const raw = process.env.PLAID_COUNTRY_CODES?.trim() || "US";
  const codes = raw
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const allowed = new Set(Object.values(CountryCode));
  const resolved = codes.filter((c): c is CountryCode =>
    allowed.has(c as CountryCode),
  );
  return resolved.length > 0 ? resolved : [CountryCode.Us];
}

export const PLAID_SAFETY = [
  "Connected Accounts are owner-only private vault data.",
  "Plaid access tokens are encrypted at rest and never sent to the browser.",
  "Family membership never grants access to linked financial accounts.",
  "Balances and holdings are not indexed for Ask AI, Photos, or Memories.",
  "Disconnect removes local financial connection data for that item.",
] as const;
