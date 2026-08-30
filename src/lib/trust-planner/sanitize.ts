/**
 * Strip secret-like fields that must never live in a trust draft.
 */

import type { TrustAnswers } from "@/lib/trust-planner/questions";

export const TRUST_FORBIDDEN_ANSWER_KEYS = [
  "seedPhrase",
  "seed_phrase",
  "seed",
  "mnemonic",
  "privateKey",
  "private_key",
  "password",
  "passwords",
  "passphrase",
  "recoveryPhrase",
  "recovery_phrase",
  "walletKey",
  "wallet_key",
] as const;

const FORBIDDEN_SET = new Set<string>(
  TRUST_FORBIDDEN_ANSWER_KEYS.map((k) => k.toLowerCase()),
);

function stripForbiddenFromObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripForbiddenFromObject);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (FORBIDDEN_SET.has(key.toLowerCase())) continue;
      out[key] = stripForbiddenFromObject(nested);
    }
    return out;
  }
  return value;
}

export function sanitizeTrustAnswers(answers: TrustAnswers): TrustAnswers {
  return stripForbiddenFromObject(answers) as TrustAnswers;
}
