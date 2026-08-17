import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
} from "plaid";
import { getPlaidCredentials } from "@/lib/plaid/config";

let cached: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (cached) return cached;
  const { clientId, secret, env } = getPlaidCredentials();
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  cached = new PlaidApi(configuration);
  return cached;
}

/** Test helper — clear singleton between env changes. */
export function resetPlaidClientForTests(): void {
  cached = null;
}
