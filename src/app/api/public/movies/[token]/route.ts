import { NextResponse } from "next/server";
import { resolvePublicMovieShare } from "@/lib/movies/public-share";

type RouteContext = {
  params: Promise<{ token: string }>;
};

/**
 * GET /api/public/movies/[token] — single shared movie payload (no auth).
 * Never lists other library items.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing share token" }, { status: 400 });
  }

  try {
    const resolved = await resolvePublicMovieShare(token);
    if (!resolved) {
      return NextResponse.json(
        { error: "This share link is unavailable.", code: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      movie: resolved.movie,
      shareUrl: resolved.shareUrl,
    });
  } catch (error) {
    console.error("[public.movies] resolve failed", error);
    return NextResponse.json(
      { error: "Could not load this shared movie." },
      { status: 500 },
    );
  }
}
