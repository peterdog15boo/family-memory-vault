import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  listMemoryPage,
  serializeMemoryListItem,
} from "@/lib/memories";

/**
 * GET /api/memories/library?scope=own|shared&offset=0&limit=48
 */
export async function GET(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { searchParams } = new URL(request.url);
  const scopeParam = searchParams.get("scope");
  if (scopeParam !== "own" && scopeParam !== "shared") {
    return NextResponse.json(
      { error: "scope must be 'own' or 'shared'" },
      { status: 400 },
    );
  }

  const offset = Math.max(Number(searchParams.get("offset") ?? "0") || 0, 0);
  const limitRaw = Number(searchParams.get("limit") ?? "48");
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? limitRaw : 48, 1),
    48,
  );

  const { items, hasMore } = await listMemoryPage(userId, scopeParam, {
    limit,
    offset,
  });

  return NextResponse.json({
    items: items.map(serializeMemoryListItem),
    hasMore,
    offset,
    limit,
  });
}
