import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  buildMovieSharePageUrl,
  lookupPublicMovieShare,
} from "@/lib/movies/public-share";
import { getObjectBytes } from "@/lib/r2";

type RouteContext = {
  params: Promise<{ token: string }>;
};

async function fallbackPosterJpeg(title: string): Promise<Buffer> {
  const safe = title.replace(/[<>&]/g, "").trim().slice(0, 60) || "Family movie";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#1a1410"/>
  <text x="64" y="120" fill="#e8c9a4" font-family="Georgia, serif" font-size="34">Family Memory Vault</text>
  <text x="64" y="320" fill="#f7f0e8" font-family="Georgia, serif" font-size="52">${safe}</text>
  <text x="64" y="560" fill="#f7f0e8" fill-opacity="0.7" font-family="Arial, sans-serif" font-size="26">A family movie worth sharing</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

/**
 * GET /api/public/movies/[token]/poster
 * Stable JPEG for Open Graph / social previews (no auth).
 * Facebook’s crawler needs a durable URL — not a short-lived R2 signed link.
 * Always returns a JPEG (movie poster or branded fallback).
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

    const shareUrl = buildMovieSharePageUrl(row.share.token);
    const thumbKey = row.movie.thumbnailKey?.trim();
    if (thumbKey) {
      try {
        const object = await getObjectBytes(thumbKey);
        const contentType =
          object.contentType?.startsWith("image/")
            ? object.contentType
            : "image/jpeg";
        return new NextResponse(new Uint8Array(object.body), {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control":
              "public, max-age=3600, stale-while-revalidate=86400",
            "Content-Disposition": "inline",
            "X-Robots-Tag": "noindex",
            "X-Share-Url": shareUrl,
          },
        });
      } catch (error) {
        console.warn("[public.movies.poster] thumbnail fetch failed — fallback", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const title = row.movie.title?.trim() || "Family movie";
    const jpeg = await fallbackPosterJpeg(title);
    return new NextResponse(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
        "Content-Disposition": "inline",
        "X-Robots-Tag": "noindex",
        "X-Share-Url": shareUrl,
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
