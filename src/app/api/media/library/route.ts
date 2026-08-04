import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import {
  getSafeMediaPage,
  MEDIA_PAGE_SIZE,
  type MediaLibraryScope,
} from "@/lib/media/queries";
import { serializeSafeMediaItem } from "@/lib/memories";

/**
 * GET /api/media/library?scope=own|shared&offset=0&limit=48
 *
 * Paginated clean/ready media for load-more on the media library page.
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
  const scope = scopeParam as MediaLibraryScope;

  const offset = Math.max(Number(searchParams.get("offset") ?? "0") || 0, 0);
  const limitRaw = Number(searchParams.get("limit") ?? String(MEDIA_PAGE_SIZE));
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? limitRaw : MEDIA_PAGE_SIZE, 1),
    MEDIA_PAGE_SIZE,
  );

  const { items, hasMore } = await getSafeMediaPage(userId, scope, {
    limit,
    offset,
  });

  return NextResponse.json({
    items: items.map(serializeSafeMediaItem),
    hasMore,
    offset,
    limit,
  });
}
