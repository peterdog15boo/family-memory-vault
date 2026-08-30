/**
 * Trust Planner answer validation before draft generation.
 */

import type { TrustAnswers } from "@/lib/trust-planner/questions";

export type TrustResiduePercentResult =
  | { ok: true; total: number }
  | { ok: false; total: number; error: string };

/** When residue uses specific percents, they must total exactly 100. */
export function validateTrustResiduePercents(
  answers: TrustAnswers,
): TrustResiduePercentResult {
  if (answers.residueMode !== "specific_percents") {
    return { ok: true, total: 100 };
  }

  const shares = (answers.residueShares ?? []).filter((s) =>
    Boolean(s.name?.trim()),
  );

  if (shares.length === 0) {
    return {
      ok: false,
      total: 0,
      error:
        "Add at least one person with a percent for the residue, or choose “spouse then children equally.”",
    };
  }

  let total = 0;
  for (const share of shares) {
    const n =
      typeof share.percent === "number"
        ? share.percent
        : Number.parseFloat(String(share.percent).trim());
    if (!Number.isFinite(n) || n < 0) {
      return {
        ok: false,
        total,
        error: `Enter a valid percent for ${share.name.trim()}.`,
      };
    }
    total += n;
  }

  if (Math.abs(total - 100) > 0.01) {
    return {
      ok: false,
      total,
      error: `Residue percents must total 100%. They currently total ${roundPercent(total)}%. Fix the shares before generating.`,
    };
  }

  return { ok: true, total: 100 };
}

function roundPercent(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export class TrustGenerateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustGenerateValidationError";
  }
}
