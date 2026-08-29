/**
 * Strip secret-like fields that must never live in a will draft.
 */

import type { WillAnswers } from "@/lib/will-planner/questions";

/** Keys that must never persist on will answers (defense in depth). */
export const WILL_FORBIDDEN_ANSWER_KEYS = [
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
  WILL_FORBIDDEN_ANSWER_KEYS.map((k) => k.toLowerCase()),
);

function stripForbiddenFromObject(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(stripForbiddenFromObject);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_SET.has(key.toLowerCase())) continue;
      out[key] = stripForbiddenFromObject(nested);
    }
    return out;
  }
  return value;
}

/** Returns a copy of answers with forbidden secret fields removed. */
export function sanitizeWillAnswers(answers: WillAnswers): WillAnswers {
  return stripForbiddenFromObject(answers) as WillAnswers;
}

/** Crypto interview field keys — must not include seed/password fields. */
export function cryptoStepFieldKeys(): string[] {
  return [
    "cryptoHoldingTypes",
    "cryptoInstructionsLocation",
    "cryptoAccessRequester",
  ];
}
