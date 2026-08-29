/**
 * Will Planner answer validation before draft generation.
 */

import type { WillAnswers } from "@/lib/will-planner/questions";

export type ResiduePercentResult =
  | { ok: true; total: number }
  | { ok: false; total: number; error: string };

/** When residue uses specific percents, they must total exactly 100. */
export function validateResiduePercents(
  answers: WillAnswers,
): ResiduePercentResult {
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
        "Add at least one person with a percent for the residuary estate, or choose another residue option.",
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

  // Allow tiny floating-point noise
  if (Math.abs(total - 100) > 0.01) {
    return {
      ok: false,
      total,
      error: `Residuary percents must total 100%. They currently total ${roundPercent(total)}%. Fix the shares before building the draft.`,
    };
  }

  return { ok: true, total: 100 };
}

function roundPercent(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export class WillGenerateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WillGenerateValidationError";
  }
}
