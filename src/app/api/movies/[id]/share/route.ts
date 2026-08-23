import { NextResponse } from "next/server";
import { requireMemoryApiUser } from "@/lib/memories/http";
import { MovieError } from "@/lib/movies/errors";
import {
  ensureMovieShareLink,
  buildMovieSharePosterUrl,
} from "@/lib/movies/public-share";
import { movieApiErrorResponse } from "@/lib/movies/serialize";
import { logger } from "@/lib/observability/logger";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/movies/[id]/share — create or reuse a durable public share link.
 * Owner only. Shared page exposes this movie alone.
 */
export async function POST(_request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  const { id: movieId } = await context.params;
  if (!movieId?.trim()) {
    return NextResponse.json({ error: "Missing movie id" }, { status: 400 });
  }

  try {
    const result = await ensureMovieShareLink({
      movieId,
      userId: authResult.userId,
    });
    logger.info("movies.share.ensure_ok", {
      movieId,
      userId: authResult.userId,
      created: result.created,
      tokenPrefix: result.share.token.slice(0, 6),
    });
    return NextResponse.json({
      shareUrl: result.shareUrl,
      token: result.share.token,
      posterUrl: buildMovieSharePosterUrl(result.share.token),
      created: result.created,
    });
  } catch (error) {
    logger.error("movies.share.ensure_failed", {
      movieId,
      userId: authResult.userId,
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
      code: error instanceof MovieError ? error.code : undefined,
    });

    if (error instanceof MovieError && error.code === "not_found") {
      return NextResponse.json(
        { error: error.message, code: "not_found" },
        { status: 404 },
      );
    }
    if (error instanceof MovieError && error.code === "validation") {
      return NextResponse.json(
        { error: error.message, code: "validation" },
        { status: 400 },
      );
    }
    // Prefer a concrete message over the generic 500 fallback.
    if (error instanceof Error && error.message.trim()) {
      return NextResponse.json(
        {
          error: `Could not create share link: ${error.message.slice(0, 180)}`,
          code: "internal",
        },
        { status: 500 },
      );
    }
    return movieApiErrorResponse(error, "Failed to create share link");
  }
}
