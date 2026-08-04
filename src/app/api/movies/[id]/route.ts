import { NextResponse } from "next/server";
import { requireMemoryApiUser } from "@/lib/memories/http";
import {
  deleteMovie,
  getMovie,
} from "@/lib/movies/lifecycle";
import {
  movieApiErrorResponse,
  serializeMovie,
} from "@/lib/movies/serialize";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/movies/[id] — movie status (+ signed play URLs when ready).
 * Owner only.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  const { id: movieId } = await context.params;
  if (!movieId?.trim()) {
    return NextResponse.json({ error: "Missing movie id" }, { status: 400 });
  }

  try {
    const row = await getMovie(movieId, authResult.userId);
    if (!row) {
      return NextResponse.json(
        { error: "Movie not found", code: "not_found" },
        { status: 404 },
      );
    }
    const movie = await serializeMovie(row, { includeUrls: true });
    return NextResponse.json({ movie });
  } catch (error) {
    return movieApiErrorResponse(error, "Failed to load movie");
  }
}

/**
 * DELETE /api/movies/[id] — remove movie record + R2 objects (owner only).
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  const { id: movieId } = await context.params;
  if (!movieId?.trim()) {
    return NextResponse.json({ error: "Missing movie id" }, { status: 400 });
  }

  try {
    await deleteMovie(movieId, authResult.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return movieApiErrorResponse(error, "Failed to delete movie");
  }
}
