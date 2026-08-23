import { NextResponse } from "next/server";
import {
  buildMovieSharePageUrl,
  lookupPublicMovieShare,
} from "@/lib/movies/public-share";
import { getObjectBytes } from "@/lib/r2";

type RouteContext = {
  params: Promise<{ token: string }>;
};

/**
 * GET /api/public/movies/[token]/poster
 * Stable JPEG for Open Graph / social previews (no auth).
 * Facebook’s crawler needs a durable URL — not a short-lived R2 signed link.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token?.trim()) {
    return NextResponse.json({ error: "Missing share token" }, { status: 400 });
  }

  try {
    const row = await lookupPublicMovieShare(token);
    if (!row) {
      return NextResponse.json(
        { error: "This share link is unavailable.", code: "not_found" },
        { status: 404 },
      );
    }

    const thumbKey = row.movie.thumbnailKey?.trim();
    if (!thumbKey) {
      return NextResponse.json(
        { error: "Poster not available.", code: "not_found" },
        { status: 404 },
      );
    }

    const object = await getObjectBytes(thumbKey);
    const bytes = object.body;
    const contentType =
      object.contentType?.startsWith("image/")
        ? object.contentType
        : "image/jpeg";

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Disposition": "inline",
        // Help Facebook/Twitter crawlers; this is intentionally public.
        "X-Robots-Tag": "noindex",
        "X-Share-Url": buildMovieSharePageUrl(row.share.token),
      },
    });
  } catch (error) {
    console.error("[public.movies.poster] failed", error);
    return NextResponse.json(
      { error: "Could not load poster." },
      { status: 500 },
    );
  }
}
