import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listIncomingEmergencyDesignations } from "@/lib/emergency-access";
import { serializeEmergencyAccessDesignation } from "@/lib/emergency-access/serialize";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import { ensureAppUser } from "@/lib/users";

/** GET /api/emergency-access/incoming — designations where current user is the trusted contact. */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  try {
    await ensureAppUser(userId);
    const rows = await listIncomingEmergencyDesignations(userId);
    return NextResponse.json({
      designations: rows.map((row) =>
        serializeEmergencyAccessDesignation(row, {
          ownerDisplayName: row.ownerDisplayName,
        }),
      ),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load incoming designations");
  }
}
