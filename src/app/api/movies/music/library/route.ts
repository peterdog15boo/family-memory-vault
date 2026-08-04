import { NextResponse } from "next/server";
import {
  MUSIC_CATEGORIES,
  MUSIC_CATEGORY_LABELS,
  MOVIE_LIBRARY_TRACKS,
  libraryTrackPreviewUrl,
} from "@/lib/movies/music/library";
import { requireMemoryApiUser } from "@/lib/memories/http";

/**
 * GET /api/movies/music/library — built-in soundtrack catalog + preview URLs.
 */
export async function GET() {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  const tracks = MOVIE_LIBRARY_TRACKS.map((track) => ({
    id: track.id,
    label: track.label,
    category: track.category,
    categoryLabel: MUSIC_CATEGORY_LABELS[track.category],
    durationSeconds: track.durationSeconds,
    blurb: track.blurb,
    moodTags: [...track.moodTags],
    attribution: track.attribution ?? null,
    previewUrl: libraryTrackPreviewUrl(track),
  }));

  const categories = MUSIC_CATEGORIES.map((id) => ({
    id,
    label: MUSIC_CATEGORY_LABELS[id],
  }));

  return NextResponse.json({ tracks, categories });
}
