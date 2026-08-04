import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { assertEmergencyLegacyReadAccess } from "@/lib/emergency-access";
import { loadLegacyVault } from "@/lib/legacy/load-vault";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import { logSensitiveAccess } from "@/lib/security/sensitive-access";
import { ensureAppUser } from "@/lib/users";

type RouteContext = { params: Promise<{ ownerUserId: string }> };

/**
 * GET /api/legacy/granted/[ownerUserId]
 * Read-only Digital Legacy vault for an active emergency grantee.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { ownerUserId } = await context.params;

  try {
    await ensureAppUser(userId);
    const role = await assertEmergencyLegacyReadAccess(ownerUserId, userId);
    if (role !== "granted_emergency") {
      return NextResponse.json(
        { error: "Emergency access not granted." },
        { status: 403 },
      );
    }

    const vault = await loadLegacyVault(ownerUserId, {
      includeSecureContent: false,
    });

    await logSensitiveAccess({
      userId,
      action: "emergency_access.vault_view",
      targetType: "legacy_vault",
      targetId: ownerUserId,
      metadata: { accessMode: "granted_emergency" },
    });

    return NextResponse.json({
      ...vault,
      accessMode: "granted_emergency" as const,
      ownerUserId,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load granted legacy vault");
  }
}
