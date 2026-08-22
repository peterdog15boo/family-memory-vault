/**
 * API auth helpers that also enforce plan feature gates.
 */

import { NextResponse } from "next/server";
import {
  requireApiUser,
  type ApiAuthResult,
  type RequireApiUserOptions,
} from "@/lib/auth/api";
import {
  canUseLegacyPlusFeatures,
  type PlanGateResult,
} from "@/lib/plans/gates";

export function planGateDeniedResponse(gate: PlanGateResult): NextResponse {
  return NextResponse.json(
    {
      error: gate.reason ?? "This feature is not included on your plan.",
      code: gate.code ?? "plan_limit",
      upgradeHint: gate.upgradeHint,
      planSlug: gate.planSlug,
      planName: gate.planName,
    },
    { status: 403 },
  );
}

/**
 * Require auth + Legacy+ features (Private Documents / Digital Legacy / Accounts).
 * Does not apply to emergency-access “granted” routes — call requireApiUser there.
 */
export async function requireLegacyPlusApiUser(
  options: RequireApiUserOptions = {},
): Promise<ApiAuthResult> {
  const authResult = await requireApiUser(options);
  if (!authResult.ok) return authResult;

  const gate = await canUseLegacyPlusFeatures(authResult.userId);
  if (!gate.allowed) {
    return { ok: false, response: planGateDeniedResponse(gate) };
  }

  return authResult;
}
