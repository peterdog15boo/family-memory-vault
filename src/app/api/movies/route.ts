import { NextResponse } from "next/server";
import { requireMemoryApiUser } from "@/lib/memories/http";
import { listUserMoviesWithMemory } from "@/lib/movies/list";
import {
  movieApiErrorResponse,
  serializeMovie,
} from "@/lib/movies/serialize";

/**
 * GET /api/movies — list the signed-in user's generated movies (newest first).
 */
export async function GET() {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const rows = await listUserMoviesWithMemory(authResult.userId, {
      limit: 48,
    });
    const movies = await Promise.all(
      rows.map((row) => serializeMovie(row, { includeUrls: true })),
    );
    return NextResponse.json({ movies });
  } catch (error) {
    return movieApiErrorResponse(error, "Failed to list movies");
  }
}
