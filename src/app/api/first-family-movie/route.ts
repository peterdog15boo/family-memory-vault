import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  FirstFamilyMovieCreateError,
  startFirstFamilyMovieCreate,
} from "@/lib/first-family-movie/create";
import {
  markFirstFamilyMovieComplete,
  markFirstFamilyMovieRevealSeen,
  markFirstFamilyMovieSkipped,
  saveFirstFamilyMovieId,
} from "@/lib/first-family-movie";
import { FFM_SOFT_MIN_PHOTOS } from "@/lib/first-family-movie/guided-upload";
import { discoverPeopleFromMediaIds } from "@/lib/first-family-movie/people-discovery";
import {
  isFirstMovieFunnelEvent,
} from "@/lib/first-family-movie/funnel";
import { logFirstMovieFunnelEvent } from "@/lib/first-family-movie/track-server";
import { MovieError } from "@/lib/movies/errors";
import { MemoryError } from "@/lib/memories/errors";
import { LEGAL_AGREE_PATH, shouldRedirectToLegalAgree } from "@/lib/legal-agree/gate";
import { APP_HOME_PATH } from "@/lib/routes";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { drainUntilMovieTerminal } from "@/workers/movies";

export const runtime = "nodejs";

async function postRitualRedirect(userId: string): Promise<string> {
  if (await shouldRedirectToLegalAgree(userId)) {
    return `${LEGAL_AGREE_PATH}?redirect_url=${encodeURIComponent(APP_HOME_PATH)}`;
  }
  return APP_HOME_PATH;
}

const funnelPropsSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .optional();

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("complete"),
    /** When true, emit first_movie_completed (celebration close only). */
    trackFunnel: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("skip"),
  }),
  z.object({
    action: z.literal("reveal-seen"),
  }),
  z.object({
    action: z.literal("create-movie"),
    mediaIds: z
      .array(z.string().min(1))
      .min(FFM_SOFT_MIN_PHOTOS)
      .max(60),
  }),
  z.object({
    action: z.literal("discover-people"),
    mediaIds: z.array(z.string().min(1)).min(1).max(60),
  }),
  z.object({
    action: z.literal("track"),
    event: z.string().refine(isFirstMovieFunnelEvent, {
      message: "Unknown funnel event",
    }),
    props: funnelPropsSchema,
  }),
]);

/**
 * POST /api/first-family-movie
 * - complete | create-movie | discover-people | track
 */
export async function POST(request: Request) {
  const originBlock = rejectUntrustedOrigin(request);
  if (originBlock) return originBlock;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.action === "complete") {
    await markFirstFamilyMovieComplete(userId);
    if (parsed.data.trackFunnel === true) {
      logFirstMovieFunnelEvent("first_movie_completed", { userId });
    }
    return NextResponse.json({
      ok: true,
      redirectTo: await postRitualRedirect(userId),
    });
  }

  if (parsed.data.action === "skip") {
    await markFirstFamilyMovieSkipped(userId);
    logFirstMovieFunnelEvent("first_movie_completed", {
      userId,
      skipped: true,
    });
    return NextResponse.json({
      ok: true,
      redirectTo: await postRitualRedirect(userId),
    });
  }

  if (parsed.data.action === "reveal-seen") {
    await markFirstFamilyMovieRevealSeen(userId);
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "track") {
    const event = parsed.data.event;
    if (!isFirstMovieFunnelEvent(event)) {
      return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    }
    logFirstMovieFunnelEvent(event, {
      userId,
      ...(parsed.data.props ?? {}),
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "discover-people") {
    try {
      const result = await discoverPeopleFromMediaIds(
        userId,
        parsed.data.mediaIds,
      );
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      console.error("[api.first-family-movie] discover-people failed", error);
      return NextResponse.json(
        { error: "Could not load people from your photos." },
        { status: 500 },
      );
    }
  }

  const limited = enforceRateLimit(
    `ffm-create:${userId}`,
    RATE_LIMITS.movieCreate.limit,
    RATE_LIMITS.movieCreate.windowMs,
  );
  if (limited) return limited;

  try {
    const result = await startFirstFamilyMovieCreate({
      userId,
      mediaIds: parsed.data.mediaIds,
    });

    if (result.phase === "awaiting_media") {
      return NextResponse.json({ ok: true, ...result }, { status: 202 });
    }

    logFirstMovieFunnelEvent("first_movie_render_started", {
      userId,
      movieId: result.movie.id,
      memoryId: result.memoryId,
      mediaCount: parsed.data.mediaIds.length,
    });

    try {
      await saveFirstFamilyMovieId(userId, result.movie.id);
    } catch (error) {
      console.warn("[api.first-family-movie] save movie id failed", error);
    }

    if (process.env.NODE_ENV === "development") {
      const movieId = result.movie.id;
      after(async () => {
        try {
          await drainUntilMovieTerminal(movieId, { maxJobs: 5 });
        } catch (error) {
          console.error(
            "[api.first-family-movie] Background drain failed",
            movieId,
            error,
          );
        }
      });
    }

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof FirstFamilyMovieCreateError) {
      const status = error.code === "flag_off" ? 403 : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    if (error instanceof MemoryError) {
      return NextResponse.json(
        { error: error.message, code: error.code ?? "validation" },
        { status: 400 },
      );
    }
    if (error instanceof MovieError) {
      const status =
        error.code === "plan_limit" || error.code === "quota_exceeded"
          ? 403
          : error.code === "not_found"
            ? 404
            : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    console.error("[api.first-family-movie] create-movie failed", error);
    return NextResponse.json(
      { error: "Could not start your first movie. Please try again." },
      { status: 500 },
    );
  }
}
