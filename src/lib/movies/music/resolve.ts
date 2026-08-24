/**
 * Resolve movie music settings to a local audio file for ffmpeg mixing.
 */

import { existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MovieError } from "@/lib/movies/errors";
import type { NormalizedMovieSettings } from "@/lib/movies/settings";
import {
  movieSettingsRequestMusic,
  validateMovieMusicSettings,
} from "@/lib/movies/settings";
import {
  getLibraryTrack,
  resolveSuggestionToLibraryId,
  type MovieLibraryTrack,
} from "@/lib/movies/music/library";
import { fetchMovieMusicBytes } from "@/lib/movies/music/upload";

/** Reject empty / truncated music assets (corrupt R2 or zero-byte placeholders). */
export const MIN_MUSIC_FILE_BYTES = 2048;

function moduleDir(): string {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

/**
 * Resolve a packaged library track on disk. Tries cwd (Next/dev), then
 * paths relative to this module (compiled / workers).
 */
export function libraryTrackAbsolutePath(track: MovieLibraryTrack): string {
  const candidates = [
    join(process.cwd(), "public", "music", "library", track.filename),
    join(process.cwd(), "apps", "web", "public", "music", "library", track.filename),
    join(moduleDir(), "..", "..", "..", "..", "public", "music", "library", track.filename),
    join(moduleDir(), "..", "..", "..", "..", "..", "public", "music", "library", track.filename),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export type ResolvedMovieMusic = {
  source: "library" | "upload";
  /** Absolute path on disk for ffmpeg -i */
  localPath: string;
  label: string;
  trackId: string | null;
  uploadKey: string | null;
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
  loop: boolean;
  /** Bytes on disk after resolve (for worker logs). */
  byteSize: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(1, Math.max(0, n));
}

function assertMusicFileUsable(localPath: string, label: string): number {
  if (!existsSync(localPath)) {
    throw new MovieError(`Music file missing after resolve: ${label}`, {
      retryable: false,
      code: "not_found",
    });
  }
  let byteSize = 0;
  try {
    byteSize = statSync(localPath).size;
  } catch {
    throw new MovieError(`Could not read music file size: ${label}`, {
      retryable: true,
    });
  }
  if (byteSize < MIN_MUSIC_FILE_BYTES) {
    throw new MovieError(
      `Music file is empty or truncated (${byteSize} bytes): ${label}`,
      { retryable: false, code: "validation" },
    );
  }
  return byteSize;
}

/**
 * Resolve music for a render. Returns null when the user chose no music.
 * Throws MovieError when music was requested but cannot be loaded — so we
 * never ship a silent MP4 that looks like “music worked.”
 */
export async function resolveMovieMusic(input: {
  userId: string;
  settings: NormalizedMovieSettings;
  workDir: string;
}): Promise<ResolvedMovieMusic | null> {
  const { settings, userId, workDir } = input;
  const volume = clamp01(settings.musicVolume);
  const fadeInMs = settings.musicFadeInMs;
  const fadeOutMs = settings.musicFadeOutMs;
  // Prefer looping so the soundtrack covers the full visual timeline (Memory
  // movies can outlast a single ~45s library bed). Explicit false still pads.
  const loop = settings.musicLoop !== false;

  const validation = validateMovieMusicSettings(settings);
  if (!validation.ok) {
    throw new MovieError(validation.message, {
      retryable: false,
      code: "validation",
    });
  }

  if (!movieSettingsRequestMusic(settings)) {
    return null;
  }

  // Strict by source: library never falls through to a stale upload key.
  if (settings.musicSource === "upload") {
    if (!settings.musicUploadKey?.trim()) {
      throw new MovieError("Upload music selected but no file was attached.", {
        retryable: false,
        code: "validation",
      });
    }
    const bytes = await fetchMovieMusicBytes(userId, settings.musicUploadKey);
    if (!bytes?.byteLength || bytes.byteLength < MIN_MUSIC_FILE_BYTES) {
      throw new MovieError(
        `Uploaded music could not be fetched from storage (got ${bytes?.byteLength ?? 0} bytes).`,
        { retryable: true },
      );
    }
    const ext =
      settings.musicUploadKey.split(".").pop()?.toLowerCase() || "mp3";
    const localPath = join(workDir, `music_upload.${ext}`);
    await writeFile(localPath, bytes);
    const byteSize = assertMusicFileUsable(localPath, settings.musicUploadKey);
    console.info("[movies.music] Resolved upload music", {
      uploadKey: settings.musicUploadKey,
      byteSize,
      localPath,
      volume,
      fadeInMs,
      fadeOutMs,
      loop,
    });
    return {
      source: "upload",
      localPath,
      label: settings.musicLabel || "Uploaded track",
      trackId: null,
      uploadKey: settings.musicUploadKey,
      volume,
      fadeInMs,
      fadeOutMs,
      loop,
      byteSize,
    };
  }

  // library (including inferred from trackId when source was recovered)
  let trackId =
    settings.musicTrackId ||
    resolveSuggestionToLibraryId(settings.musicSuggestionId);

  if (!trackId && settings.musicSource === "library") {
    trackId = "soft-piano";
  }

  if (!trackId) {
    throw new MovieError(
      "Music was selected but no library track id is available to resolve.",
      { retryable: false, code: "validation" },
    );
  }

  const track = getLibraryTrack(trackId);
  if (!track) {
    throw new MovieError(`Unknown library music track: ${trackId}`, {
      retryable: false,
      code: "validation",
    });
  }

  const localPath = libraryTrackAbsolutePath(track);
  if (!existsSync(localPath)) {
    throw new MovieError(
      `Library music file missing on server: ${track.filename}. Ensure public/music/library is deployed with the worker.`,
      {
        retryable: false,
        code: "not_found",
      },
    );
  }

  const byteSize = assertMusicFileUsable(localPath, track.filename);
  console.info("[movies.music] Resolved library music", {
    trackId: track.id,
    filename: track.filename,
    byteSize,
    localPath,
    volume,
    fadeInMs,
    fadeOutMs,
    loop,
  });

  return {
    source: "library",
    localPath,
    label: settings.musicLabel || track.label,
    trackId: track.id,
    uploadKey: null,
    volume,
    fadeInMs,
    fadeOutMs,
    loop,
    byteSize,
  };
}
