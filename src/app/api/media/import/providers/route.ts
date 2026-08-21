import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { listImportProviderInfo } from "@/lib/media/import/providers";
import { listMediaConnectionsForUser } from "@/lib/media/import/connections";

/**
 * GET /api/media/import/providers — availability + existing connections.
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const [providers, connections] = await Promise.all([
    Promise.resolve(listImportProviderInfo()),
    listMediaConnectionsForUser(userId),
  ]);

  return NextResponse.json({ providers, connections });
}
