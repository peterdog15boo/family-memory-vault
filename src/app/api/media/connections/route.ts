import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  disconnectMediaConnection,
  listMediaConnectionsForUser,
} from "@/lib/media/import/connections";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { z } from "zod";

/**
 * GET /api/media/connections — list active cloud import connections.
 */
export async function GET() {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const connections = await listMediaConnectionsForUser(authResult.userId);
  return NextResponse.json({ connections });
}

const disconnectSchema = z.object({
  connectionId: z.string().min(1).max(64),
});

/**
 * DELETE /api/media/connections — disconnect a provider (revokes stored tokens).
 */
export async function DELETE(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = disconnectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ok = await disconnectMediaConnection(parsed.data.connectionId, userId);
  if (!ok) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
