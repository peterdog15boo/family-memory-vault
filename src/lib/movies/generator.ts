/**
 * Core movie generation service.
 *
 * Pipeline:
 *   1. Load movie + owned memory
 *   2. Select/order clean+ready media from that memory
 *   3. Apply theme rules (duration, transitions, overlays)
 *   4. Render frames (sharp) → encode MP4 (ffmpeg)
 *   5. Upload to R2 under movies/
 *   6. Update movie record → ready | failed
 *
 * Extension points (see bottom of file + themes.ts):
 *   - MovieThemeDefinition / resolveMovieTheme
 *   - MovieClipSelector / buildRenderPlan
 *   - MovieFrameRenderer / MovieVideoEncoder
 *   - Face-aware Ken Burns framing (framing.ts + faces table)
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  rm,
  writeFile,
  readFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import sharp, { type Sharp } from "sharp";
import { getDb } from "@/lib/db";
import {
  media,
  memories,
  memoryMedia,
  movies,
  type Media,
  type Movie,
  type MovieStyle,
} from "@/lib/db/schema";
import { cleanReadyMediaFilter } from "@/lib/media/queries";
import { isSafeToServe } from "@/lib/moderation/types";
import { MovieError } from "@/lib/movies/errors";
import { updateMovieStatus } from "@/lib/movies/lifecycle";
import {
  movieSettingsRequestMusic,
  normalizeMovieSettings,
  validateMovieMusicSettings,
  zoomIntensityFactor,
  type MovieSettings,
  type MovieTransition,
  type NormalizedMovieSettings,
} from "@/lib/movies/settings";
import { resolveMovieColorGrade } from "@/lib/movies/filters";
import type { ThemeColorGrade } from "@/lib/movies/themes";
import {
  buildKenBurnsTimeline,
  kenBurnsCrop,
  kenBurnsCrossfadeProgress,
  kenBurnsMotionDurationMs,
  sliceKenBurnsSamplesByTime,
  type ZoomDirectionMode,
} from "@/lib/movies/motion";
import {
  centerFraming,
  clampSourceCropFloat,
  sourceCropAtScale,
  type KenBurnsSourceCrop,
  type MediaFraming,
} from "@/lib/movies/framing";
import {
  ensureFaceFramingForRender,
  framingFromMediaRow,
  resolveFramingForClips,
} from "@/lib/movies/framing-cache";
import { logKenBurnsFaceFocus } from "@/lib/movies/face-debug";
import { applyColorGrade, applyLetterbox, applyPreparedGrade, prepareGradeOverlays, type GradeOverlayPack } from "@/lib/movies/effects";
import {
  renderTransitionFrames,
  resolveTransitionDurationMs,
  transitionSampleCount,
  transitionSampleProgress,
} from "@/lib/movies/transitions";
import {
  buildNormalizeVideoClipArgs,
  isMovieVideoMedia,
  resolveVideoClipDurationMs,
  videoWorkFilenames,
} from "@/lib/movies/video-clips";
import {
  resolveMovieTheme,
  type MovieThemeDefinition,
  type Rgb,
} from "@/lib/movies/themes";
import {
  buildEncodeVideoFilter,
  buildLibx264EncodeArgs,
  resolveMovieOutputSpec,
  scaleThemeFontSize,
  type MovieOutputSpec,
} from "@/lib/movies/output";
import { composeMoviePoster } from "@/lib/movies/poster";
import { resolveMovieMusic } from "@/lib/movies/music/resolve";
import {
  mixMovieAudio,
  probeAudioStream,
} from "@/lib/movies/music/mix";
import { getPlanCapabilities } from "@/lib/plans/gates";
import {
  buildMovieOutputKey,
  buildMovieThumbnailKey,
  getObjectBytes,
  isQuarantineKey,
  putObjectBytes,
  R2_PREFIXES,
} from "@/lib/r2";

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export type GenerateMovieInput = {
  /** Existing movies row (from createMovieJob). */
  movieId: string;
  memoryId: string;
  userId: string;
  /** Override style/settings/title for this run (defaults from movie row). */
  style?: MovieStyle;
  settings?: MovieSettings;
  title?: string;
  /**
   * Prefer short, snappy renders (fewer clips, milder Ken Burns, smaller frame).
   * Worker v1 defaults this on so users get a result quickly.
   */
  fast?: boolean;
};

export type GenerateMovieResult = {
  movie: Movie;
  outputKey: string;
  thumbnailKey: string;
  durationSeconds: number;
  clipCount: number;
  width: number;
  height: number;
  encoder: "ffmpeg";
};

/** One slide/clip in the render timeline. */
export type MovieClip = {
  mediaId: string;
  sortOrder: number;
  caption: string | null;
  /**
   * Photos/titles: still image key.
   * Videos: original video object key (trimmed into the export).
   */
  sourceKey: string;
  contentType: string;
  kind: "photo" | "video" | "title";
  durationMs: number;
  /** Face-aware focal framing (photos only). */
  framing?: MediaFraming | null;
};

/** Fully resolved plan before pixels are produced. */
export type MovieRenderPlan = {
  movieId: string;
  userId: string;
  memoryId: string;
  title: string;
  theme: MovieThemeDefinition;
  settings: NormalizedMovieSettings;
  transition: MovieTransition;
  /** Resolved transition duration for this render. */
  transitionDurationMs: number;
  width: number;
  height: number;
  clips: MovieClip[];
  /** Total runtime including title card. */
  durationSeconds: number;
  fast: boolean;
  output: MovieOutputSpec;
  /** Resolved filter/theme grade baked into every frame. */
  colorGrade: ThemeColorGrade;
};

export type RenderedFrame = {
  index: number;
  path: string;
  durationMs: number;
  /** title card vs photo Ken Burns sample (for poster selection). */
  kind: "title" | "photo";
};

/** Normalized memory-video segment ready for concat with photo runs. */
export type RenderedVideoSegment = {
  mediaId: string;
  path: string;
  durationMs: number;
};

/**
 * Mixed timeline: Ken Burns JPEG runs and trimmed video segments, in order.
 */
export type MovieTimelineItem =
  | { kind: "frames"; frames: RenderedFrame[] }
  | { kind: "video"; segment: RenderedVideoSegment };

export type RenderedMovieAssets = {
  items: MovieTimelineItem[];
  /** Flat photo/title frames (poster + photo-only encode path). */
  frames: RenderedFrame[];
};

export type EncodedMovie = {
  buffer: Buffer;
  contentType: "video/mp4";
  durationSeconds: number;
  width: number;
  height: number;
  thumbnailJpeg: Buffer;
  encoder: "ffmpeg";
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Generate a movie for an existing job row and mark it ready/failed.
 *
 * Safe to call from a `movie.render` worker. Always updates the movie record.
 */
export async function generateMovie(
  input: GenerateMovieInput,
): Promise<GenerateMovieResult> {
  const movieId = input.movieId?.trim();
  const memoryId = input.memoryId?.trim();
  const userId = input.userId?.trim();
  if (!movieId || !memoryId || !userId) {
    throw new MovieError("movieId, memoryId, and userId are required.");
  }

  await updateMovieStatus(movieId, "processing");

  let workDir: string | null = null;
  try {
    const ctx = await loadGenerationContext(input);
    const clips = await selectAndOrderClips(ctx);
    const plan = buildRenderPlan(ctx, clips);

    workDir = await mkdtemp(join(tmpdir(), "fmv-movie-"));
    const assets = await renderMovieAssets(plan, workDir);
    const encoded = await encodeMovieTimeline(plan, assets, workDir);

    const outputKey = buildMovieOutputKey(userId, movieId);
    const thumbnailKey = buildMovieThumbnailKey(userId, movieId);

    await putObjectBytes(outputKey, encoded.buffer, {
      contentType: encoded.contentType,
    });
    await putObjectBytes(thumbnailKey, encoded.thumbnailJpeg, {
      contentType: "image/jpeg",
    });

    const movie = await updateMovieStatus(movieId, "ready", {
      outputKey,
      thumbnailKey,
      durationSeconds: encoded.durationSeconds,
      errorMessage: null,
    });

    const { logMovieReady } = await import("@/lib/observability/events");
    logMovieReady({
      movieId,
      userId,
      memoryId: movie.memoryId,
      durationSeconds: encoded.durationSeconds,
      encoder: encoded.encoder,
    });

    const { queueMovieReadyLifecycle } = await import("@/lib/email/lifecycle");
    queueMovieReadyLifecycle({
      userId,
      movieId,
      memoryId: movie.memoryId,
      title: movie.title || "Your memory movie",
    });

    return {
      movie,
      outputKey,
      thumbnailKey,
      durationSeconds: encoded.durationSeconds,
      clipCount: plan.clips.filter(
        (c) => c.kind === "photo" || c.kind === "video",
      ).length,
      width: encoded.width,
      height: encoded.height,
      encoder: encoded.encoder,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 2000) : "Movie render failed.";
    const retryable =
      !(error instanceof MovieError) || error.retryable !== false;

    // Only terminal failures mark the movie failed here.
    // Retryable errors stay processing so the UI keeps polling while the job requeues.
    if (!retryable) {
      await updateMovieStatus(movieId, "failed", { errorMessage: message }).catch(
        () => undefined,
      );
    } else {
      await updateMovieStatus(movieId, "processing", {
        errorMessage: `Temporary issue — retrying: ${message.slice(0, 400)}`,
      }).catch(() => undefined);
    }

    throw error instanceof MovieError
      ? error
      : new MovieError(message);
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * Build a render plan without encoding (tests / dry-run / future AI planners).
 */
export async function planMovieGeneration(
  input: GenerateMovieInput,
): Promise<MovieRenderPlan> {
  const ctx = await loadGenerationContext(input);
  const clips = await selectAndOrderClips(ctx);
  return buildRenderPlan(ctx, clips);
}

/* -------------------------------------------------------------------------- */
/* Context + media selection                                                  */
/* -------------------------------------------------------------------------- */

type GenerationContext = {
  movie: Movie;
  memoryTitle: string;
  userId: string;
  memoryId: string;
  style: MovieStyle;
  settings: NormalizedMovieSettings;
  title: string;
  theme: MovieThemeDefinition;
  /** Worker speed path — derived from qualityMode === "fast". */
  fast: boolean;
  /** Plan allows Ultra 4K exports. */
  allowUltra: boolean;
};

async function loadGenerationContext(
  input: GenerateMovieInput,
): Promise<GenerationContext> {
  const db = getDb();

  const [movie] = await db
    .select()
    .from(movies)
    .where(
      and(eq(movies.id, input.movieId), eq(movies.userId, input.userId)),
    )
    .limit(1);

  if (!movie) {
    throw new MovieError("Movie not found.", {
      retryable: false,
      code: "not_found",
    });
  }
  if (movie.memoryId !== input.memoryId) {
    throw new MovieError("Movie memoryId mismatch.", {
      retryable: false,
      code: "validation",
    });
  }

  const [memory] = await db
    .select({
      id: memories.id,
      userId: memories.userId,
      title: memories.title,
    })
    .from(memories)
    .where(
      and(eq(memories.id, input.memoryId), eq(memories.userId, input.userId)),
    )
    .limit(1);

  if (!memory) {
    throw new MovieError("Memory not found.", {
      retryable: false,
      code: "not_found",
    });
  }

  const style = input.style ?? movie.style;
  const settings = normalizeMovieSettings({
    ...((movie.settings ?? {}) as MovieSettings),
    ...(input.settings ?? {}),
  });
  const theme = resolveMovieTheme(style);
  const title =
    input.title?.trim() ||
    movie.title?.trim() ||
    memory.title?.trim() ||
    "Family movie";

  const caps = await getPlanCapabilities(input.userId);
  const fast =
    Boolean(input.fast) ||
    settings.qualityMode === "fast" ||
    process.env.MOVIE_FAST_RENDER === "true";

  return {
    movie,
    memoryTitle: memory.title,
    userId: input.userId,
    memoryId: input.memoryId,
    style,
    settings: {
      ...settings,
      qualityMode: fast ? "fast" : settings.qualityMode,
    },
    title,
    theme,
    fast,
    allowUltra: caps.priorityRender,
  };
}

/**
 * Load only clean+ready media linked to the memory, in album order.
 * Photos and videos are both eligible for the movie timeline.
 */
export async function loadCleanMemoryMedia(
  memoryId: string,
  ownerUserId: string,
): Promise<
  Array<{
    media: Media;
    sortOrder: number;
    caption: string | null;
  }>
> {
  const db = getDb();

  const links = await db
    .select({
      media,
      sortOrder: memoryMedia.sortOrder,
      caption: memoryMedia.caption,
    })
    .from(memoryMedia)
    .innerJoin(media, eq(memoryMedia.mediaId, media.id))
    .where(
      and(
        eq(memoryMedia.memoryId, memoryId),
        // SAFETY GATE — never pull non-clean / non-ready media into a movie
        cleanReadyMediaFilter(ownerUserId),
      ),
    )
    .orderBy(asc(memoryMedia.sortOrder), asc(memoryMedia.addedAt));

  return links
    .filter((row) => {
      // Defense in depth — SQL already gates, but never trust a stale join.
      const m = row.media;
      return (
        isSafeToServe(m.moderationStatus) &&
        m.status === "ready" &&
        m.userId === ownerUserId
      );
    })
    .map((row) => ({
      media: row.media,
      sortOrder: row.sortOrder,
      caption: row.caption,
    }));
}

async function selectAndOrderClips(
  ctx: GenerationContext,
): Promise<MovieClip[]> {
  const links = await loadCleanMemoryMedia(ctx.memoryId, ctx.userId);
  if (links.length === 0) {
    throw new MovieError(
      "No clean media available in this memory. Add clean photos or videos and try again.",
      { retryable: false },
    );
  }

  const photoDurationMs = ctx.fast
    ? Math.min(
        ctx.settings.photoDurationMs || ctx.theme.timing.defaultClipDurationMs,
        2800,
      )
    : ctx.settings.photoDurationMs || ctx.theme.timing.defaultClipDurationMs;
  const maxClips = ctx.fast
    ? Math.min(ctx.theme.timing.maxClips, 12)
    : ctx.theme.timing.maxClips;

  const clips: MovieClip[] = [];
  const photoMediaRows: Media[] = [];
  for (const link of links) {
    if (clips.length >= maxClips) break;

    if (isMovieVideoMedia(link.media)) {
      const sourceKey = pickVideoKey(link.media);
      if (!sourceKey) continue;
      if (isQuarantineKey(sourceKey)) {
        console.warn("[movies] Skipping quarantined video key", {
          mediaId: link.media.id,
        });
        continue;
      }
      clips.push({
        mediaId: link.media.id,
        sortOrder: link.sortOrder,
        caption: link.caption,
        sourceKey,
        contentType: link.media.contentType,
        kind: "video",
        durationMs: resolveVideoClipDurationMs({
          sourceDurationMs: link.media.durationMs,
          photoDurationMs,
          fast: ctx.fast,
        }),
        framing: null,
      });
      continue;
    }

    const sourceKey = pickStillKey(link.media);
    if (!sourceKey) continue;
    if (isQuarantineKey(sourceKey)) {
      console.warn("[movies] Skipping quarantined media key", {
        mediaId: link.media.id,
      });
      continue;
    }

    photoMediaRows.push(link.media);
    clips.push({
      mediaId: link.media.id,
      sortOrder: link.sortOrder,
      caption: link.caption,
      sourceKey,
      contentType: link.media.contentType,
      kind: "photo",
      durationMs: photoDurationMs,
      framing: null,
    });
  }

  if (clips.length === 0) {
    throw new MovieError(
      "No renderable photos or videos found in this memory.",
      { retryable: false },
    );
  }

  // Face framing for photo clips only.
  const framingMap = await resolveFramingForClips(photoMediaRows, ctx.userId);
  let faceFramed = 0;
  for (const clip of clips) {
    if (clip.kind !== "photo") continue;
    const fromMap = framingMap.get(clip.mediaId);
    const row = photoMediaRows.find((m) => m.id === clip.mediaId);
    const cached = row ? framingFromMediaRow(row) : null;
    const framing =
      fromMap?.source === "faces"
        ? fromMap
        : cached?.source === "faces"
          ? cached
          : (fromMap ?? cached ?? centerFraming());
    clip.framing = framing;
    if (framing.source === "faces") faceFramed += 1;
  }
  const photoCount = clips.filter((c) => c.kind === "photo").length;
  const videoCount = clips.filter((c) => c.kind === "video").length;
  console.info("[movies] Face framing resolved", {
    movieId: ctx.movie.id,
    clips: clips.length,
    photos: photoCount,
    videos: videoCount,
    faceFramed,
    centerFallback: photoCount - faceFramed,
  });
  for (const clip of clips) {
    if (clip.kind !== "photo") continue;
    const f = clip.framing;
    if (!f) continue;
    console.info("[movies] Clip framing plan", {
      movieId: ctx.movie.id,
      mediaId: clip.mediaId,
      hasFaceData: f.source === "faces",
      path: f.source,
      focal_point_x: Number(f.focalPointX.toFixed(4)),
      focal_point_y: Number(f.focalPointY.toFixed(4)),
      subject_bounds: f.subjectBounds
        ? {
            x: Number(f.subjectBounds.x.toFixed(4)),
            y: Number(f.subjectBounds.y.toFixed(4)),
            w: Number(f.subjectBounds.width.toFixed(4)),
            h: Number(f.subjectBounds.height.toFixed(4)),
            faceCount: f.subjectBounds.faceCount,
          }
        : null,
    });
  }

  // Photos share remaining runtime after title + videos (videos keep natural length).
  const titleMs =
    ctx.settings.includeTitles && ctx.theme.text.showTitleCard
      ? Math.min(
          ctx.theme.text.titleCardDurationMs,
          ctx.fast ? 2000 : ctx.theme.text.titleCardDurationMs,
        )
      : 0;
  const targetSeconds = ctx.fast
    ? Math.min(ctx.settings.targetDurationSeconds, 40)
    : ctx.settings.targetDurationSeconds;
  const targetMs = targetSeconds * 1000;
  const videoTotalMs = clips
    .filter((c) => c.kind === "video")
    .reduce((sum, c) => sum + c.durationMs, 0);
  const photoClips = clips.filter((c) => c.kind === "photo");
  if (photoClips.length > 0) {
    const photoBudget = Math.max(
      photoDurationMs * photoClips.length,
      targetMs - titleMs - videoTotalMs,
    );
    const perClip = Math.max(
      1000,
      Math.min(photoDurationMs, Math.floor(photoBudget / photoClips.length)),
    );
    for (const clip of photoClips) {
      clip.durationMs = perClip;
    }
  }

  return clips;
}

function pickVideoKey(row: Media): string | null {
  const key = row.originalKey?.trim() || null;
  if (!key) return null;
  if (isQuarantineKey(key)) return null;
  if (
    key.startsWith(R2_PREFIXES.quarantine) ||
    key.startsWith(R2_PREFIXES.temp)
  ) {
    return null;
  }
  return key;
}

function pickStillKey(row: Media): string | null {
  // Movies need the highest-res still available. Never use grid thumbnailKey
  // (typically ~480px) — that forces muddy Ken Burns upscales.
  // Prefer originalKey (true camera resolution) over processedKey (often a
  // 2048px display JPEG for lightbox).
  if (isMovieVideoMedia(row)) {
    // Stills-only helper: processed poster frame when present (not used for
    // full video playback — see pickVideoKey).
    const key = row.processedKey?.trim() || null;
    if (!key) return null;
    if (isQuarantineKey(key)) return null;
    if (
      key.startsWith(R2_PREFIXES.quarantine) ||
      key.startsWith(R2_PREFIXES.temp)
    ) {
      return null;
    }
    return key;
  }

  const key = row.originalKey?.trim() || row.processedKey?.trim() || null;
  if (!key) return null;
  if (isQuarantineKey(key)) return null;
  if (
    key.startsWith(R2_PREFIXES.quarantine) ||
    key.startsWith(R2_PREFIXES.temp)
  ) {
    return null;
  }
  return key;
}

/** Exported for unit tests — same rules as photo clip selection. */
export function pickMovieStillKey(
  row: Pick<
    Media,
    "type" | "contentType" | "originalKey" | "processedKey" | "thumbnailKey"
  >,
): string | null {
  return pickStillKey(row as Media);
}

/** Exported for unit tests — original video object for trimmed playback. */
export function pickMovieVideoKey(
  row: Pick<
    Media,
    "type" | "contentType" | "originalKey" | "processedKey" | "thumbnailKey"
  >,
): string | null {
  return pickVideoKey(row as Media);
}

/* -------------------------------------------------------------------------- */
/* Theme rules → render plan                                                  */
/* -------------------------------------------------------------------------- */

export function buildRenderPlan(
  ctx: GenerationContext,
  photoClips: MovieClip[],
): MovieRenderPlan {
  const aspect = ctx.settings.aspectRatio;
  const output = resolveMovieOutputSpec({
    aspectRatio: aspect,
    qualityMode: ctx.settings.qualityMode,
    allowUltra: ctx.allowUltra,
  });
  const transition =
    ctx.settings.transition ?? ctx.theme.transition.style;
  const transitionDurationMs = resolveTransitionDurationMs({
    style: transition,
    themeDurationMs: ctx.theme.transition.durationMs,
    clipDurationMs: ctx.settings.photoDurationMs,
    overrideMs: ctx.settings.transitionDurationMs,
  });

  const titleDurationMs = ctx.fast
    ? Math.min(ctx.theme.text.titleCardDurationMs, 2000)
    : ctx.theme.text.titleCardDurationMs;

  const clips: MovieClip[] = [];
  if (ctx.settings.includeTitles && ctx.theme.text.showTitleCard) {
    clips.push({
      mediaId: "__title__",
      sortOrder: -1,
      caption: null,
      sourceKey: "",
      contentType: "image/svg+xml",
      kind: "title",
      durationMs: titleDurationMs,
    });
  }
  clips.push(...photoClips);

  const durationSeconds =
    clips.reduce((sum, c) => sum + c.durationMs, 0) / 1000;

  const colorGrade = resolveMovieColorGrade({
    themeGrade: ctx.theme.colorGrade,
    filterId: ctx.settings.colorFilter,
    intensity: ctx.settings.colorFilterIntensity,
    grainEnabled: ctx.settings.filterGrain,
    vignetteEnabled: ctx.settings.filterVignette,
  });

  return {
    movieId: ctx.movie.id,
    userId: ctx.userId,
    memoryId: ctx.memoryId,
    title: ctx.title,
    theme: ctx.theme,
    settings: ctx.settings,
    transition,
    transitionDurationMs,
    width: output.width,
    height: output.height,
    clips,
    durationSeconds,
    fast: ctx.fast,
    output,
    colorGrade,
  };
}

/* -------------------------------------------------------------------------- */
/* Frame rendering (sharp)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Rasterize photo/title clips to JPEG frames and normalize memory videos to
 * MP4 segments (same canvas), preserving album order.
 */
export async function renderMovieAssets(
  plan: MovieRenderPlan,
  workDir: string,
): Promise<RenderedMovieAssets> {
  const frames: RenderedFrame[] = [];
  const items: MovieTimelineItem[] = [];
  let frameRun: RenderedFrame[] = [];
  let index = 0;
  let photoIndex = 0;

  const flushFrameRun = () => {
    if (frameRun.length === 0) return;
    items.push({ kind: "frames", frames: frameRun });
    frameRun = [];
  };

  const pushFrame = (frame: RenderedFrame) => {
    frames.push(frame);
    frameRun.push(frame);
  };

  const intensityFactor =
    plan.settings.zoomIntensity === "off" ||
    plan.settings.zoomDirection === "off"
      ? 0
      : zoomIntensityFactor(plan.settings.zoomIntensity);

  const directionMode: ZoomDirectionMode =
    plan.settings.zoomIntensity === "off"
      ? "off"
      : plan.settings.zoomDirection || plan.theme.motion.directionMode;

  // Build grade overlays once for the whole movie (same canvas size).
  const gradePack = await prepareGradeOverlays(
    plan.colorGrade,
    plan.width,
    plan.height,
  );

  // Letterbox overlay once when enabled. Ken Burns targets the safe content
  // band so faces are not placed under cinematic bars.
  let letterboxOverlay: Buffer | null = null;
  let letterboxBarPx = 0;
  if (plan.theme.motion.letterbox) {
    letterboxBarPx = Math.max(
      8,
      Math.round(
        plan.height *
          Math.min(Math.max(plan.theme.motion.letterboxRatio, 0.04), 0.18),
      ),
    );
    const bg = plan.theme.palette.background;
    const barSvg = Buffer.from(`
<svg width="${plan.width}" height="${plan.height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${plan.width}" height="${letterboxBarPx}" fill="rgb(${bg.r},${bg.g},${bg.b})"/>
  <rect x="0" y="${plan.height - letterboxBarPx}" width="${plan.width}" height="${letterboxBarPx}" fill="rgb(${bg.r},${bg.g},${bg.b})"/>
</svg>`);
    letterboxOverlay = await sharp(barSvg).png().toBuffer();
  }
  const framingTargetHeight = Math.max(
    64,
    plan.height - letterboxBarPx * 2,
  );

  const ffmpegPath = resolveFfmpegPath();

  for (let clipIdx = 0; clipIdx < plan.clips.length; clipIdx++) {
    const clip = plan.clips[clipIdx]!;
    if (clip.kind === "title") {
      const path = join(workDir, `frame_${String(index).padStart(4, "0")}.jpg`);
      const jpeg = await renderTitleCard(plan, clip);
      await writeFile(path, jpeg);
      pushFrame({ index, path, durationMs: clip.durationMs, kind: "title" });
      index += 1;
      continue;
    }

    if (clip.kind === "video") {
      flushFrameRun();
      if (!ffmpegPath) {
        throw new MovieError(
          "ffmpeg is not available. Install ffmpeg or keep the ffmpeg-static dependency.",
        );
      }
      const segment = await prepareVideoSegment({
        plan,
        clip,
        workDir,
        ffmpegPath,
      });
      items.push({ kind: "video", segment });
      console.info("[movies] Video clip prepared", {
        mediaId: clip.mediaId,
        durationMs: segment.durationMs,
        path: segment.path,
      });
      continue;
    }

    const { body } = await getObjectBytes(clip.sourceKey);
    if (!body || body.byteLength === 0) {
      throw new MovieError(
        `Empty media object for clip ${clip.mediaId}.`,
        { retryable: true },
      );
    }

    // Decode + auto-orient once; reuse for all Ken Burns samples.
    const oriented = await sharp(body).rotate().toBuffer();
    const meta = await sharp(oriented).metadata();
    const sourceWidth = meta.width ?? plan.width;
    const sourceHeight = meta.height ?? plan.height;

    // Fail-closed face framing: if plan has no faces, re-fetch before render
    // rather than silently center-cropping portraits.
    let framing = clip.framing ?? centerFraming();
    if (framing.source !== "faces" || !framing.subjectBounds?.faceCount) {
      try {
        const db = getDb();
        const [row] = await db
          .select()
          .from(media)
          .where(
            and(eq(media.id, clip.mediaId), eq(media.userId, plan.userId)),
          )
          .limit(1);
        if (row) {
          framing = await ensureFaceFramingForRender(
            row,
            plan.userId,
            clip.framing,
          );
          clip.framing = framing;
        }
      } catch (err) {
        console.warn("[movies] Render-time framing refresh failed", {
          mediaId: clip.mediaId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Extend Ken Burns across lead/trail crossfade windows so zoom never
    // freezes during a dissolve (outgoing finishes; incoming starts).
    const transitionMs =
      plan.transition !== "none" && plan.transitionDurationMs > 0
        ? plan.transitionDurationMs
        : 0;
    const hasNextPhoto = plan.clips
      .slice(clipIdx + 1)
      .some((c) => c.kind === "photo");
    // Lead-in only when the previous media clip was also a photo (videos hard-cut).
    const prevMedia = [...plan.clips.slice(0, clipIdx)]
      .reverse()
      .find((c) => c.kind === "photo" || c.kind === "video");
    const leadMs =
      prevMedia?.kind === "photo" && transitionMs > 0 ? transitionMs : 0;
    const trailMs = hasNextPhoto && transitionMs > 0 ? transitionMs : 0;
    const motionDurationMs = kenBurnsMotionDurationMs({
      clipDurationMs: clip.durationMs,
      leadTransitionMs: leadMs,
      trailTransitionMs: trailMs,
    });

    // Sample density ≥ encode fps (motion.ts may oversample gentle zooms).
    // Ceiling must allow oversampling — never clamp to duration×fps only.
    const encodeFps = Math.max(1, plan.output.fps);
    const motionSeconds = Math.max(0.001, motionDurationMs / 1000);
    const motionFps = encodeFps;
    const zoomPlan = buildKenBurnsTimeline({
      durationMs: motionDurationMs,
      photoIndex: photoIndex,
      directionMode,
      themeZoom: plan.theme.motion.kenBurnsZoom,
      intensityFactor,
      width: plan.width,
      height: framingTargetHeight,
      fast: plan.fast,
      targetFps: motionFps,
      sourceWidth,
      sourceHeight,
      framing,
      // Allow 2× oversample for gentle zooms on long stills (≤15s).
      maxSamples: Math.ceil(motionSeconds * motionFps * 2) + 2,
    });

    const sampleCrops = zoomPlan.samples
      .map((s) => s.sourceCrop)
      .filter((c): c is KenBurnsSourceCrop => c != null);
    logKenBurnsFaceFocus({
      mediaId: clip.mediaId,
      framing,
      sourceWidth,
      sourceHeight,
      direction: zoomPlan.direction,
      zoomAmount: zoomPlan.zoomAmount,
      crops: sampleCrops,
    });

    console.info("[movies] Ken Burns clip", {
      mediaId: clip.mediaId,
      index: photoIndex,
      direction: zoomPlan.direction,
      startScale: Number(zoomPlan.startScale.toFixed(4)),
      endScale: Number(zoomPlan.endScale.toFixed(4)),
      zoomAmount: Number(zoomPlan.zoomAmount.toFixed(4)),
      durationMs: clip.durationMs,
      motionDurationMs,
      leadMs,
      trailMs,
      samples: zoomPlan.samples.length,
      framingSource: framing.source,
      hasFaceData: framing.source === "faces",
      faceAwarePath: framing.source === "faces" ? "faces" : "center_fallback",
      startRect: zoomPlan.samples[0]?.sourceCrop
        ? {
            left: zoomPlan.samples[0]!.sourceCrop!.left,
            top: zoomPlan.samples[0]!.sourceCrop!.top,
            width: zoomPlan.samples[0]!.sourceCrop!.width,
            height: zoomPlan.samples[0]!.sourceCrop!.height,
          }
        : null,
      endRect: zoomPlan.samples.at(-1)?.sourceCrop
        ? {
            left: zoomPlan.samples.at(-1)!.sourceCrop!.left,
            top: zoomPlan.samples.at(-1)!.sourceCrop!.top,
            width: zoomPlan.samples.at(-1)!.sourceCrop!.width,
            height: zoomPlan.samples.at(-1)!.sourceCrop!.height,
          }
        : null,
      focalPoint: {
        x: Number(framing.focalPointX.toFixed(4)),
        y: Number(framing.focalPointY.toFixed(4)),
      },
      subjectFaces: framing.subjectBounds?.faceCount ?? 0,
      encodeVf: "scale+pad_only_no_recrop",
    });
    const currentPhotoIndex = photoIndex;
    photoIndex += 1;

    const captionOverlay = await buildCaptionOverlay(plan, clip.caption);

    // Solo holds: middle of the motion span (lead/trail rendered in transitions).
    const samplesForClip = sliceKenBurnsSamplesByTime(
      zoomPlan.samples,
      leadMs,
      leadMs + clip.durationMs,
    );

    // Render samples with limited concurrency for throughput without thrashing RAM.
    const concurrency = plan.fast ? 4 : 3;
    const sampleBuffers: Buffer[] = new Array(samplesForClip.length);
    for (let start = 0; start < samplesForClip.length; start += concurrency) {
      const batch = samplesForClip.slice(start, start + concurrency);
      const rendered = await Promise.all(
        batch.map((sample) =>
          renderPhotoFrame(plan, oriented, {
            linearProgress: sample.progress,
            direction: sample.direction,
            zoomAmount: zoomPlan.zoomAmount,
            sourceWidth,
            sourceHeight,
            framing,
            sourceCrop: sample.sourceCrop,
            captionOverlay,
            gradePack,
            letterboxOverlay,
            contentHeight: framingTargetHeight,
            contentTop: letterboxBarPx,
          }),
        ),
      );
      for (let i = 0; i < rendered.length; i++) {
        sampleBuffers[start + i] = rendered[i]!;
      }
    }

    for (let k = 0; k < samplesForClip.length; k++) {
      if (samplesForClip[k]!.holdMs <= 0) continue;
      const path = join(workDir, `frame_${String(index).padStart(4, "0")}.jpg`);
      const jpeg = sampleBuffers[k]!;
      await writeFile(path, jpeg);
      pushFrame({
        index,
        path,
        durationMs: samplesForClip[k]!.holdMs,
        kind: "photo",
      });
      index += 1;
    }

    // Transition into the next photo clip — both sides keep zooming.
    const nextClip = plan.clips
      .slice(clipIdx + 1)
      .find((c) => c.kind === "photo");
    if (
      nextClip &&
      trailMs > 0 &&
      plan.transition !== "none" &&
      plan.transitionDurationMs > 0
    ) {
      const { body: nextBody } = await getObjectBytes(nextClip.sourceKey);
      if (nextBody?.byteLength) {
        const nextOriented = await sharp(nextBody).rotate().toBuffer();
        const nextMeta = await sharp(nextOriented).metadata();
        const nextSourceWidth = nextMeta.width ?? plan.width;
        const nextSourceHeight = nextMeta.height ?? plan.height;
        let transitionFraming = nextClip.framing ?? centerFraming();
        if (
          transitionFraming.source !== "faces" ||
          !transitionFraming.subjectBounds?.faceCount
        ) {
          try {
            const db = getDb();
            const [row] = await db
              .select()
              .from(media)
              .where(
                and(
                  eq(media.id, nextClip.mediaId),
                  eq(media.userId, plan.userId),
                ),
              )
              .limit(1);
            if (row) {
              transitionFraming = await ensureFaceFramingForRender(
                row,
                plan.userId,
                nextClip.framing,
              );
              nextClip.framing = transitionFraming;
            }
          } catch {
            /* keep planned framing */
          }
        }

        const nextClipIdx = plan.clips.indexOf(nextClip);
        const nextHasNextPhoto =
          nextClipIdx >= 0 &&
          plan.clips
            .slice(nextClipIdx + 1)
            .some((c) => c.kind === "photo");
        const nextLeadMs = transitionMs;
        const nextTrailMs = nextHasNextPhoto ? transitionMs : 0;
        const nextMotionDurationMs = kenBurnsMotionDurationMs({
          clipDurationMs: nextClip.durationMs,
          leadTransitionMs: nextLeadMs,
          trailTransitionMs: nextTrailMs,
        });
        const nextMotionSeconds = Math.max(
          0.001,
          nextMotionDurationMs / 1000,
        );
        const nextZoomPlan = buildKenBurnsTimeline({
          durationMs: nextMotionDurationMs,
          photoIndex: currentPhotoIndex + 1,
          directionMode,
          themeZoom: plan.theme.motion.kenBurnsZoom,
          intensityFactor,
          width: plan.width,
          height: framingTargetHeight,
          fast: plan.fast,
          targetFps: motionFps,
          sourceWidth: nextSourceWidth,
          sourceHeight: nextSourceHeight,
          framing: transitionFraming,
          maxSamples: Math.ceil(nextMotionSeconds * motionFps * 2) + 2,
        });

        const txCount = transitionSampleCount(
          plan.transition,
          plan.transitionDurationMs,
          { fps: plan.output.fps, fast: plan.fast },
        );
        const fromJpegs: Buffer[] = new Array(txCount);
        const toJpegs: Buffer[] = new Array(txCount);
        const outgoingWindow = {
          leadMs,
          clipDurationMs: clip.durationMs,
          trailMs,
        };
        const incomingWindow = {
          leadMs: nextLeadMs,
          clipDurationMs: nextClip.durationMs,
          trailMs: nextTrailMs,
        };

        for (let start = 0; start < txCount; start += concurrency) {
          const batchIdx = Array.from(
            { length: Math.min(concurrency, txCount - start) },
            (_, j) => start + j,
          );
          const rendered = await Promise.all(
            batchIdx.map(async (i) => {
              const u = transitionSampleProgress(i, txCount);
              const { fromProgress, toProgress } = kenBurnsCrossfadeProgress({
                transitionU: u,
                outgoing: outgoingWindow,
                incoming: incomingWindow,
              });
              const fromCrop = kenBurnsCrop({
                progress: fromProgress,
                direction: zoomPlan.direction,
                zoomAmount: zoomPlan.zoomAmount,
                width: plan.width,
                height: framingTargetHeight,
                sourceWidth,
                sourceHeight,
                framing,
              });
              const toCrop = kenBurnsCrop({
                progress: toProgress,
                direction: nextZoomPlan.direction,
                zoomAmount: nextZoomPlan.zoomAmount,
                width: plan.width,
                height: framingTargetHeight,
                sourceWidth: nextSourceWidth,
                sourceHeight: nextSourceHeight,
                framing: transitionFraming,
              });
              const [fromJpeg, toJpeg] = await Promise.all([
                renderPhotoFrame(plan, oriented, {
                  linearProgress: fromProgress,
                  direction: zoomPlan.direction,
                  zoomAmount: zoomPlan.zoomAmount,
                  sourceWidth,
                  sourceHeight,
                  framing,
                  sourceCrop: fromCrop.sourceCrop,
                  captionOverlay: null,
                  gradePack,
                  letterboxOverlay,
                  contentHeight: framingTargetHeight,
                  contentTop: letterboxBarPx,
                }),
                renderPhotoFrame(plan, nextOriented, {
                  linearProgress: toProgress,
                  direction: nextZoomPlan.direction,
                  zoomAmount: nextZoomPlan.zoomAmount,
                  sourceWidth: nextSourceWidth,
                  sourceHeight: nextSourceHeight,
                  framing: transitionFraming,
                  sourceCrop: toCrop.sourceCrop,
                  captionOverlay: null,
                  gradePack,
                  letterboxOverlay,
                  contentHeight: framingTargetHeight,
                  contentTop: letterboxBarPx,
                }),
              ]);
              return { i, fromJpeg, toJpeg };
            }),
          );
          for (const row of rendered) {
            fromJpegs[row.i] = row.fromJpeg;
            toJpegs[row.i] = row.toJpeg;
          }
        }

        const transitionFrames = await renderTransitionFrames({
          style: plan.transition,
          fromJpegs,
          toJpegs,
          durationMs: plan.transitionDurationMs,
          width: plan.width,
          height: plan.height,
          background: plan.theme.palette.background,
          fast: plan.fast,
          fps: plan.output.fps,
          jpegQuality: plan.output.frameJpegQuality,
        });

        for (const tf of transitionFrames) {
          const path = join(
            workDir,
            `frame_${String(index).padStart(4, "0")}.jpg`,
          );
          await writeFile(path, tf.jpeg);
          pushFrame({
            index,
            path,
            durationMs: tf.durationMs,
            kind: "photo",
          });
          index += 1;
        }
      }
    }
  }

  flushFrameRun();

  if (items.length === 0) {
    throw new MovieError("Movie renderer produced no timeline items.");
  }

  return { items, frames };
}

/** @deprecated Prefer {@link renderMovieAssets} — kept for callers expecting frames only. */
export async function renderFrames(
  plan: MovieRenderPlan,
  workDir: string,
): Promise<RenderedFrame[]> {
  const assets = await renderMovieAssets(plan, workDir);
  if (assets.frames.length === 0 && assets.items.some((i) => i.kind === "video")) {
    // Video-only movies have no JPEG frames; encoder uses segments instead.
    return assets.frames;
  }
  if (assets.frames.length === 0) {
    throw new MovieError("Frame renderer produced no frames.");
  }
  return assets.frames;
}

async function prepareVideoSegment(input: {
  plan: MovieRenderPlan;
  clip: MovieClip;
  workDir: string;
  ffmpegPath: string;
}): Promise<RenderedVideoSegment> {
  const { plan, clip, workDir, ffmpegPath } = input;
  const { body } = await getObjectBytes(clip.sourceKey);
  if (!body || body.byteLength === 0) {
    throw new MovieError(`Empty video object for clip ${clip.mediaId}.`, {
      retryable: true,
    });
  }
  const { rawPath, segmentPath } = videoWorkFilenames(
    workDir,
    clip.mediaId,
    clip.contentType,
  );
  await writeFile(rawPath, Buffer.from(body));
  const args = buildNormalizeVideoClipArgs({
    inputPath: rawPath,
    outputPath: segmentPath,
    durationMs: clip.durationMs,
    width: plan.width,
    height: plan.height,
    fps: plan.output.fps,
    output: plan.output,
  });
  try {
    await runFfmpeg(ffmpegPath, args);
  } catch (err) {
    throw new MovieError(
      `Could not include video in movie (${clip.mediaId}): ${
        err instanceof Error ? err.message.slice(0, 400) : String(err)
      }`,
      { retryable: true },
    );
  }
  return {
    mediaId: clip.mediaId,
    path: segmentPath,
    durationMs: clip.durationMs,
  };
}

async function renderTitleCard(
  plan: MovieRenderPlan,
  _clip: MovieClip,
): Promise<Buffer> {
  const { width, height, theme, title } = plan;
  const { text, palette, motion } = theme;
  const bg = rgbCss(palette.background);
  const lines: string[] = [];

  if (text.showMemoryTitle) {
    lines.push(escapeXml(title).slice(0, 80));
  }
  for (const tag of text.taglines) {
    if (tag.trim()) lines.push(escapeXml(tag.trim()).slice(0, 90));
  }
  if (text.showThemeLabel && lines.length === 0) {
    lines.push(escapeXml(theme.label));
  } else if (text.showThemeLabel && text.taglines.length === 0) {
    lines.push(escapeXml(theme.label));
  }

  const primary = lines[0] ?? escapeXml(theme.label);
  const secondary = lines.slice(1);
  const titleSize = scaleThemeFontSize(text.titleFontSize, height);
  const tagSize = scaleThemeFontSize(text.taglineFontSize, height);

  const secondarySvg = secondary
    .map(
      (line, i) => `
  <text x="50%" y="${52 + i * 6}%" text-anchor="middle" font-family="${text.fontFamily}"
        font-size="${tagSize}" fill="${text.fill}" opacity="0.8">${line}</text>`,
    )
    .join("");

  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${bg}"/>
  <rect x="0" y="${height * 0.4}" width="${width}" height="${Math.max(3, Math.round(height * 0.004))}" fill="${text.accentFill}" opacity="0.75"/>
  <text x="50%" y="48%" text-anchor="middle" font-family="${text.fontFamily}"
        font-size="${titleSize}" fill="${text.fill}" font-weight="600">${primary}</text>
  ${secondarySvg}
</svg>`;

  let pipeline: Sharp = sharp(Buffer.from(svg));
  pipeline = await applyColorGrade(pipeline, plan.colorGrade, width, height);
  if (motion.letterbox) {
    pipeline = await applyLetterbox(
      pipeline,
      width,
      height,
      palette.background,
      motion.letterboxRatio,
    );
  }
  return pipeline
    .jpeg({
      quality: plan.output.frameJpegQuality,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();
}

async function buildCaptionOverlay(
  plan: MovieRenderPlan,
  caption: string | null,
): Promise<Buffer | null> {
  const { width, height, theme, settings } = plan;
  const { text } = theme;
  if (
    !settings.includeTitles ||
    !text.showCaptions ||
    !caption?.trim()
  ) {
    return null;
  }

  const captionSize = scaleThemeFontSize(text.captionFontSize, height);
  const captionY =
    text.captionPosition === "top"
      ? Math.round(height * 0.09)
      : height - Math.round(height * 0.07);
  const gradientH = Math.round(height * 0.18);
  const gradientY = text.captionPosition === "top" ? 0 : height - gradientH;
  const captionSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="${text.captionPosition === "top" ? 1 : 0}" x2="0" y2="${text.captionPosition === "top" ? 0 : 1}">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.55)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradientY}" width="${width}" height="${gradientH}" fill="url(#g)"/>
  <text x="${Math.round(width * 0.04)}" y="${captionY}" font-family="${text.fontFamily}"
        font-size="${captionSize}" fill="${text.fill}"${
          text.captionShadow
            ? ` stroke="rgba(0,0,0,0.35)" stroke-width="0.6"`
            : ""
        }>${escapeXml(caption.trim()).slice(0, 90)}</text>
</svg>`);
  return sharp(captionSvg).png().toBuffer();
}

async function renderPhotoFrame(
  plan: MovieRenderPlan,
  orientedSource: Buffer,
  opts: {
    linearProgress: number;
    direction: import("@/lib/movies/motion").ZoomDirection;
    zoomAmount: number;
    sourceWidth: number;
    sourceHeight: number;
    framing: MediaFraming;
    sourceCrop: import("@/lib/movies/framing").KenBurnsSourceCrop | null;
    captionOverlay: Buffer | null;
    gradePack: GradeOverlayPack;
    letterboxOverlay: Buffer | null;
    /** Safe content band height (full height minus letterbox bars). */
    contentHeight?: number;
    contentTop?: number;
  },
): Promise<Buffer> {
  const { width, height } = plan;
  const contentHeight = Math.max(
    1,
    Math.min(height, opts.contentHeight ?? height),
  );
  const contentTop = Math.max(0, opts.contentTop ?? 0);
  const framingTargetHeight = contentHeight;

  // When faces are present, always resolve a face-anchored source crop —
  // never fall through to legacy centre cover (filters/transitions must not
  // regress framing).
  const crop =
    opts.sourceCrop ??
    kenBurnsCrop({
      progress: opts.linearProgress,
      direction: opts.direction,
      zoomAmount: opts.zoomAmount,
      width,
      height: framingTargetHeight,
      sourceWidth: opts.sourceWidth,
      sourceHeight: opts.sourceHeight,
      framing: opts.framing,
    }).sourceCrop;

  let pipeline: Sharp;
  if (crop || opts.framing.source === "faces") {
    const faceCrop =
      crop ??
      sourceCropAtScale({
        scale: 1,
        sourceWidth: opts.sourceWidth,
        sourceHeight: opts.sourceHeight,
        targetWidth: width,
        targetHeight: framingTargetHeight,
        framing: opts.framing,
      });
    pipeline = extractSourceCropSubpixel(
      sharp(orientedSource).clone(),
      faceCrop,
      opts.sourceWidth,
      opts.sourceHeight,
      width,
      contentHeight,
    );
  } else {
    // Legacy cover + pan only when no face framing and no source crop.
    const legacy = kenBurnsCrop({
      progress: opts.linearProgress,
      direction: opts.direction,
      zoomAmount: opts.zoomAmount,
      width,
      height: contentHeight,
    });
    pipeline = sharp(orientedSource).resize(legacy.frameW, legacy.frameH, {
      fit: "cover",
      position: "centre",
      kernel: "lanczos3",
      withoutEnlargement: false,
    });
    if (legacy.frameW !== width || legacy.frameH !== contentHeight) {
      pipeline = pipeline.extract({
        left: legacy.left,
        top: legacy.top,
        width,
        height: contentHeight,
      });
    }
  }

  // Pad letterbox-safe content into the full canvas without an intermediate
  // JPEG (avoid double loss before the final frame encode).
  if (contentHeight < height) {
    const top = Math.min(contentTop, Math.max(0, height - contentHeight));
    const bottom = Math.max(0, height - contentHeight - top);
    const bg = plan.theme.palette.background;
    pipeline = pipeline.extend({
      top,
      bottom,
      left: 0,
      right: 0,
      background: { r: bg.r, g: bg.g, b: bg.b },
    });
  }

  pipeline = applyPreparedGrade(pipeline, opts.gradePack);

  const composites: { input: Buffer }[] = [];
  if (opts.captionOverlay) composites.push({ input: opts.captionOverlay });
  // Letterbox bars are already painted via extend; keep overlay only when
  // content fills the full frame (defensive for themes that still pass it).
  if (opts.letterboxOverlay && contentHeight >= height) {
    composites.push({ input: opts.letterboxOverlay });
  }
  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }

  // High-quality intermediates reduce generation loss before libx264.
  return pipeline
    .jpeg({
      quality: plan.output.frameJpegQuality,
      mozjpeg: true,
      chromaSubsampling: "4:4:4",
    })
    .toBuffer();
}

function rgbCss(c: Rgb): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* -------------------------------------------------------------------------- */
/* Video encode (ffmpeg)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Encode photo JPEG runs + trimmed memory videos → H.264 MP4 (+ optional music).
 */
export async function encodeMovieTimeline(
  plan: MovieRenderPlan,
  assets: RenderedMovieAssets,
  workDir: string,
): Promise<EncodedMovie> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    throw new MovieError(
      "ffmpeg is not available. Install ffmpeg or keep the ffmpeg-static dependency.",
    );
  }

  const outputPath = join(workDir, "output.mp4");
  void plan.transition;
  const durationSeconds = timelineDurationSeconds(assets);
  await assembleTimelineMp4({
    plan,
    assets,
    workDir,
    ffmpegPath,
    outputPath,
  });

  return finalizeEncodedMovie({
    plan,
    assets,
    workDir,
    ffmpegPath,
    outputPath,
    durationSeconds,
  });
}

/**
 * Encode frame sequence → H.264 MP4 via ffmpeg-static (or FFMPEG_PATH).
 * Extension point: replace with cloud AV / AI video APIs later.
 */
export async function encodeSlideshowVideo(
  plan: MovieRenderPlan,
  frames: RenderedFrame[],
  workDir: string,
): Promise<EncodedMovie> {
  return encodeMovieTimeline(
    plan,
    { items: [{ kind: "frames", frames }], frames },
    workDir,
  );
}

function timelineDurationSeconds(assets: RenderedMovieAssets): number {
  let ms = 0;
  for (const item of assets.items) {
    if (item.kind === "frames") {
      ms += item.frames.reduce((s, f) => s + f.durationMs, 0);
    } else {
      ms += item.segment.durationMs;
    }
  }
  return Math.max(0.1, ms / 1000);
}

async function assembleTimelineMp4(input: {
  plan: MovieRenderPlan;
  assets: RenderedMovieAssets;
  workDir: string;
  ffmpegPath: string;
  outputPath: string;
}): Promise<void> {
  const { plan, assets, workDir, ffmpegPath, outputPath } = input;
  const { fps } = plan.output;
  const vf = buildEncodeVideoFilter(plan.width, plan.height, fps);

  const onlyFrames =
    assets.items.length === 1 && assets.items[0]!.kind === "frames";
  if (onlyFrames) {
    const framesItem = assets.items[0]!;
    if (framesItem.kind !== "frames" || framesItem.frames.length === 0) {
      throw new MovieError("Frame renderer produced no frames.");
    }
    const frames = framesItem.frames;
    const concatPath = join(workDir, "concat.txt");
    await writeFile(concatPath, buildFfConcatFile(frames), "utf8");
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-vf",
      vf,
      ...buildLibx264EncodeArgs(plan.output),
      outputPath,
    ]);
    return;
  }

  const segmentPaths: string[] = [];
  let run = 0;
  for (const item of assets.items) {
    if (item.kind === "video") {
      segmentPaths.push(item.segment.path);
      continue;
    }
    if (item.frames.length === 0) continue;
    const segPath = join(
      workDir,
      `photo_run_${String(run).padStart(3, "0")}.mp4`,
    );
    const concatPath = join(
      workDir,
      `photo_run_${String(run).padStart(3, "0")}_concat.txt`,
    );
    run += 1;
    await writeFile(concatPath, buildFfConcatFile(item.frames), "utf8");
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-vf",
      vf,
      ...buildLibx264EncodeArgs(plan.output),
      segPath,
    ]);
    segmentPaths.push(segPath);
  }

  if (segmentPaths.length === 0) {
    throw new MovieError("Movie timeline produced no video segments.");
  }
  if (segmentPaths.length === 1) {
    await runFfmpeg(ffmpegPath, [
      "-y",
      "-i",
      segmentPaths[0]!,
      "-c",
      "copy",
      outputPath,
    ]);
    return;
  }

  const listPath = join(workDir, "segments_concat.txt");
  const lines = ["ffconcat version 1.0"];
  for (const p of segmentPaths) {
    lines.push(`file '${escapeConcatPath(p)}'`);
  }
  await writeFile(listPath, `${lines.join("\n")}\n`, "utf8");
  await runFfmpeg(ffmpegPath, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-vf",
    vf,
    ...buildLibx264EncodeArgs(plan.output),
    outputPath,
  ]);
}

async function finalizeEncodedMovie(input: {
  plan: MovieRenderPlan;
  assets: RenderedMovieAssets;
  workDir: string;
  ffmpegPath: string;
  outputPath: string;
  durationSeconds: number;
}): Promise<EncodedMovie> {
  const { plan, assets, workDir, ffmpegPath, outputPath, durationSeconds } =
    input;
  let finalVideoPath = outputPath;
  const wantsMusic = movieSettingsRequestMusic(plan.settings);

  const musicValidation = validateMovieMusicSettings(plan.settings);
  console.info("[movies] Audio path — settings at render start", {
    movieId: plan.movieId,
    wantsMusic,
    musicSource: plan.settings.musicSource,
    musicTrackId: plan.settings.musicTrackId,
    musicSuggestionId: plan.settings.musicSuggestionId,
    musicUploadKey: plan.settings.musicUploadKey ? "(set)" : null,
    musicVolume: plan.settings.musicVolume,
    musicFadeInMs: plan.settings.musicFadeInMs,
    musicFadeOutMs: plan.settings.musicFadeOutMs,
    musicLoop: plan.settings.musicLoop,
    validationOk: musicValidation.ok,
    timelineItems: assets.items.length,
    videoSegments: assets.items.filter((i) => i.kind === "video").length,
  });
  if (!musicValidation.ok) {
    throw new MovieError(musicValidation.message, {
      retryable: false,
      code: "validation",
    });
  }

  const music = await resolveMovieMusic({
    userId: plan.userId,
    settings: plan.settings,
    workDir,
  });

  if (wantsMusic && !music) {
    throw new MovieError(
      "Music was selected for this movie but could not be resolved for the export mix.",
      { retryable: false, code: "validation" },
    );
  }

  if (music) {
    console.info("[movies] Audio path — mixing", {
      movieId: plan.movieId,
      source: music.source,
      label: music.label,
      trackId: music.trackId,
      localPath: music.localPath,
      byteSize: music.byteSize,
      volume: music.volume,
      fadeInMs: music.fadeInMs,
      fadeOutMs: music.fadeOutMs,
      loop: music.loop,
      durationSeconds,
    });
    const mixed = await mixMovieAudio({
      ffmpegPath,
      videoPath: outputPath,
      music,
      durationSeconds,
      workDir,
      runFfmpeg,
    });
    finalVideoPath = mixed.path;
  } else {
    console.info("[movies] Audio path — skipped (no music selected)", {
      movieId: plan.movieId,
    });
  }

  if (wantsMusic) {
    const probe = await probeAudioStream(ffmpegPath, finalVideoPath);
    console.info("[movies] Audio path — output probe", {
      movieId: plan.movieId,
      finalVideoPath,
      hasAudioStream: probe.hasAudio,
      audioDurationSeconds: probe.durationSeconds,
      videoDurationSeconds: durationSeconds,
    });
    if (!probe.hasAudio) {
      throw new MovieError(
        "Export finished without an audio stream even though music was selected. The soundtrack mix failed — re-queue the movie after checking library files / upload.",
        { retryable: true },
      );
    }
    if (
      probe.durationSeconds != null &&
      probe.durationSeconds + 0.5 < durationSeconds * 0.85
    ) {
      throw new MovieError(
        `Export audio is too short (${probe.durationSeconds.toFixed(1)}s) for a ${durationSeconds.toFixed(1)}s movie with music selected.`,
        { retryable: true },
      );
    }
  }

  const buffer = await readFile(finalVideoPath);
  if (buffer.byteLength < 32) {
    throw new MovieError("ffmpeg produced an empty video.");
  }

  const thumbnailJpeg = await buildMovieThumbnailJpeg(
    plan,
    assets,
    ffmpegPath,
  );

  return {
    buffer,
    contentType: "video/mp4",
    durationSeconds: Number(durationSeconds.toFixed(2)),
    width: plan.width,
    height: plan.height,
    thumbnailJpeg,
    encoder: "ffmpeg",
  };
}

async function buildMovieThumbnailJpeg(
  plan: MovieRenderPlan,
  assets: RenderedMovieAssets,
  ffmpegPath: string,
): Promise<Buffer> {
  const photoFrames = assets.frames.filter((f) => f.kind === "photo");
  const posterPool =
    photoFrames.length > 0
      ? photoFrames
      : assets.frames.filter((f) => f.kind === "title");

  let coverJpeg: Buffer | null = null;
  if (posterPool.length > 0) {
    const coverFrame =
      plan.settings.posterStyle === "photo"
        ? (posterPool[
            Math.min(Math.floor(posterPool.length * 0.2), posterPool.length - 1)
          ] ?? posterPool[0]!)
        : (posterPool[
            Math.min(
              Math.floor(posterPool.length * 0.35),
              posterPool.length - 1,
            )
          ] ?? posterPool[0]!);
    coverJpeg = await readFile(coverFrame.path);
  } else {
    const firstVideo = assets.items.find((i) => i.kind === "video");
    if (firstVideo?.kind === "video") {
      const outStill = firstVideo.segment.path.replace(
        /\.mp4$/i,
        "_poster.jpg",
      );
      try {
        await runFfmpeg(ffmpegPath, [
          "-y",
          "-ss",
          "0.3",
          "-i",
          firstVideo.segment.path,
          "-frames:v",
          "1",
          "-q:v",
          "2",
          outStill,
        ]);
        coverJpeg = await readFile(outStill);
      } catch {
        coverJpeg = null;
      }
    }
  }

  return composeMoviePoster({
    width: plan.width,
    height: plan.height,
    title: plan.title,
    theme: plan.theme,
    coverJpeg,
    style: plan.settings.posterStyle,
  });
}

/** True when ffmpeg -i reports an Audio stream (used after music mix). */
export async function probeFileHasAudioStream(
  ffmpegPath: string,
  filePath: string,
): Promise<boolean> {
  const probe = await probeAudioStream(ffmpegPath, filePath);
  return probe.hasAudio;
}

function resolveFfmpegPath(): string | null {
  const fromEnv =
    process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const binaryNames =
    process.platform === "win32"
      ? ["ffmpeg.exe", "ffmpeg"]
      : ["ffmpeg", "ffmpeg.exe"];

  const candidateDirs: string[] = [];

  // Prefer the real package install path — webpack/Next often rewrites the
  // default export of `ffmpeg-static` into `.next/.../vendor-chunks/ffmpeg.exe`.
  try {
    const require = createRequire(join(process.cwd(), "package.json"));
    const pkgJson = require.resolve("ffmpeg-static/package.json");
    candidateDirs.push(dirname(pkgJson));
  } catch {
    // package may be missing in some deploy layouts
  }

  candidateDirs.push(
    join(process.cwd(), "node_modules", "ffmpeg-static"),
  );

  for (const dir of candidateDirs) {
    for (const name of binaryNames) {
      const full = join(dir, name);
      if (existsSync(full)) return full;
    }
  }

  return null;
}

function buildFfConcatFile(frames: RenderedFrame[]): string {
  // ffconcat requires the last file to be listed without a trailing duration
  // repeat so the final duration is honored.
  const lines = ["ffconcat version 1.0"];
  for (const frame of frames) {
    lines.push(`file '${escapeConcatPath(frame.path)}'`);
    lines.push(`duration ${(frame.durationMs / 1000).toFixed(3)}`);
  }
  const last = frames[frames.length - 1]!;
  lines.push(`file '${escapeConcatPath(last.path)}'`);
  return `${lines.join("\n")}\n`;
}

function escapeConcatPath(filePath: string): string {
  // ffmpeg concat demuxer on Windows wants forward slashes; escape quotes.
  return filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = stderr.trim().slice(-1200);
      reject(
        new MovieError(
          `ffmpeg exited with code ${code}${tail ? `: ${tail}` : ""}`,
        ),
      );
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Extension hooks (documented for future AI / advanced editors)              */
/* -------------------------------------------------------------------------- */

/**
 * Optional future: AI clip ranking / highlight detection.
 * Signature reserved so workers can inject a selector without rewriting generateMovie.
 */
export type MovieClipSelector = (
  media: Array<{ media: Media; sortOrder: number; caption: string | null }>,
  theme: MovieThemeDefinition,
) => Promise<MovieClip[]> | MovieClip[];

/**
 * Optional future: cloud / generative video backends.
 */
export type MovieVideoEncoder = (
  plan: MovieRenderPlan,
  frames: RenderedFrame[],
  workDir: string,
) => Promise<EncodedMovie>;

/**
 * Render a (possibly fractional) source crop to an exact output size.
 * Sharp extract is integer-only; covering extract + single lanczos resize
 * preserves sub-pixel alignment without a soft double-upsample pass.
 */
function extractSourceCropSubpixel(
  image: Sharp,
  crop: KenBurnsSourceCrop,
  sourceWidth: number,
  sourceHeight: number,
  outWidth: number,
  outHeight: number,
): Sharp {
  const clamped = clampSourceCropFloat({
    left: crop.left,
    top: crop.top,
    width: crop.width,
    height: crop.height,
    sourceWidth,
    sourceHeight,
    scale: crop.scale,
  });
  const leftF = clamped.left;
  const topF = clamped.top;
  const widthF = Math.max(1, clamped.width);
  const heightF = Math.max(1, clamped.height);

  const left = Math.floor(leftF);
  const top = Math.floor(topF);
  const right = Math.min(sourceWidth, Math.ceil(leftF + widthF));
  const bottom = Math.min(sourceHeight, Math.ceil(topF + heightF));
  const extractW = Math.max(1, right - left);
  const extractH = Math.max(1, bottom - top);

  // Scale so the fractional crop window maps exactly to the output size, then
  // extract the aligned region — one lanczos resize (sharper than 2×→down).
  const scaleX = outWidth / widthF;
  const scaleY = outHeight / heightF;
  const scaledW = Math.max(outWidth, Math.ceil(extractW * scaleX));
  const scaledH = Math.max(outHeight, Math.ceil(extractH * scaleY));
  const offsetX = Math.round((leftF - left) * scaleX);
  const offsetY = Math.round((topF - top) * scaleY);
  const cropLeft = Math.min(Math.max(0, offsetX), Math.max(0, scaledW - outWidth));
  const cropTop = Math.min(Math.max(0, offsetY), Math.max(0, scaledH - outHeight));

  return image
    .extract({ left, top, width: extractW, height: extractH })
    .resize(scaledW, scaledH, {
      kernel: "lanczos3",
      fit: "fill",
    })
    .extract({
      left: cropLeft,
      top: cropTop,
      width: outWidth,
      height: outHeight,
    });
}

/** Stable content fingerprint for cache / idempotent re-renders. */
export function hashRenderPlan(plan: MovieRenderPlan): string {
  const payload = JSON.stringify({
    theme: plan.theme.id,
    title: plan.title,
    transition: plan.transition,
    width: plan.width,
    height: plan.height,
    fast: plan.fast,
    settings: plan.settings,
    colorGrade: plan.colorGrade.label,
    clips: plan.clips.map((c) => ({
      mediaId: c.mediaId,
      kind: c.kind,
      sourceKey: c.sourceKey,
      durationMs: c.durationMs,
      caption: c.caption,
    })),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

