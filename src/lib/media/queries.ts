import { and, count, desc, eq, ilike, inArray, or, sql, SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import { isSafeToServe } from "@/lib/moderation/types";
import {
  getAccessibleMediaFilter,
  getAccessibleOwnerIds,
} from "@/lib/permissions";
import { getDownloadUrl } from "@/lib/r2";
import { isR2Configured } from "@/lib/upload/constants";

/** Default page size for media grids (library + load-more). */
export const MEDIA_PAGE_SIZE = 48;

/** First paint on /media — smaller than load-more max to keep SSR signing bounded. */
export const MEDIA_LIBRARY_INITIAL_SIZE = 24;

/** Cap concurrent R2 presigns during SSR (avoids serverless spikes on large libraries). */
const MEDIA_PRESIGN_CONCURRENCY = 8;

/**
 * Gallery preview signed URL TTL — long enough for browsing a page,
 * short enough that stale tabs need a refresh. Capped by R2 max (1h).
 */
export const GALLERY_PREVIEW_EXPIRES_IN_SECONDS = 60 * 30; // 30 minutes

/** Columns needed to render a SafeMediaItem (avoids pulling AI / EXIF blobs). */
const mediaGalleryColumns = {
  id: media.id,
  userId: media.userId,
  type: media.type,
  contentType: media.contentType,
  originalFilename: media.originalFilename,
  createdAt: media.createdAt,
  thumbnailKey: media.thumbnailKey,
  processedKey: media.processedKey,
  originalKey: media.originalKey,
  moderationStatus: media.moderationStatus,
  status: media.status,
} as const;

export type MediaGalleryRow = {
  id: string;
  userId: string;
  type: Media["type"];
  contentType: string;
  originalFilename: string | null;
  createdAt: Date;
  thumbnailKey: string | null;
  processedKey: string | null;
  originalKey: string;
  moderationStatus: Media["moderationStatus"];
  status: Media["status"];
};

export type SafeMediaItem = {
  id: string;
  /** Owning user id — used to split My Library vs Shared with Family. */
  userId: string;
  type: Media["type"];
  contentType: string;
  originalFilename: string | null;
  createdAt: Date;
  /** Short-lived signed URL for display — only set for clean media. */
  previewUrl: string | null;
  hasThumbnail: boolean;
};

/** Split gallery payload for My Library vs Shared with Family. */
export type SafeMediaLibrary = {
  own: SafeMediaItem[];
  shared: SafeMediaItem[];
  /** True when the user has at least one active family co-member. */
  hasFamilySharing: boolean;
  ownHasMore: boolean;
  sharedHasMore: boolean;
  pageSize: number;
};

/**
 * SQL gate for clean/ready media owned by a specific user.
 * Prefer `getAccessibleMediaFilter(userId)` when family co-member media
 * should be included (dashboard galleries).
 *
 * `userId` is required so this can never dump all users' clean media by accident.
 */
export function cleanReadyMediaFilter(userId: string): SQL {
  return and(
    eq(media.userId, userId),
    eq(media.moderationStatus, "clean"),
    eq(media.status, "ready"),
  )!;
}

/**
 * Clean + ready media owned by any of the given users (family-aware covers).
 */
export function cleanReadyMediaOwnedByFilter(ownerIds: string[]): SQL {
  return and(
    eq(media.moderationStatus, "clean"),
    eq(media.status, "ready"),
    inArray(media.userId, ownerIds),
  )!;
}

/**
 * Load clean/ready media IDs the user may view (own + family co-member).
 * Canonical helper for People assignment, Ask AI, and person galleries.
 * Returns [] for unknown / unauthorized / non-clean ids (never throws).
 */
export async function loadCleanAccessibleMediaByIds(
  userId: string,
  mediaIds: string[],
): Promise<Media[]> {
  const unique = [
    ...new Set(mediaIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];

  const db = getDb();
  const accessFilter = await getAccessibleMediaFilter(userId);
  return db
    .select()
    .from(media)
    .where(and(accessFilter, inArray(media.id, unique)));
}

/**
 * True when the user may view this media id as clean/ready own or family-shared.
 */
export async function canAccessCleanMedia(
  userId: string,
  mediaId: string,
): Promise<boolean> {
  const rows = await loadCleanAccessibleMediaByIds(userId, [mediaId]);
  return rows.length > 0;
}

/**
 * Map a DB media row to a SafeMediaItem with a short-lived signed preview URL.
 * Returns null when the row is not clean/ready (defense in depth).
 */
export async function toSafeMediaItem(
  row: MediaGalleryRow | Media,
): Promise<SafeMediaItem | null> {
  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    return null;
  }

  let previewUrl: string | null = null;
  if (isR2Configured()) {
    try {
      // Gallery cards need a JPEG poster. Don't fall back to the raw video
      // object here — iPhone HEVC/MOV often won't render as a grid thumb.
      const key =
        row.thumbnailKey ||
        (row.type === "photo" ? row.processedKey || row.originalKey : null);
      if (key) {
        const signed = await getDownloadUrl(
          key,
          GALLERY_PREVIEW_EXPIRES_IN_SECONDS,
          {
            moderationStatus: "clean",
            mediaStatus: row.status,
          },
        );
        previewUrl = signed.url;
      }
    } catch (error) {
      console.error("Failed to sign media preview URL", row.id, error);
    }
  }

  // Backfill missing posters (stale workers / prior ffmpeg failures).
  // Dynamic import keeps sharp/ffmpeg out of any accidental client graph.
  if (!row.thumbnailKey?.trim()) {
    void import("@/lib/media/thumbnails")
      .then(({ maybeGenerateThumbnailForMedia }) =>
        maybeGenerateThumbnailForMedia(row),
      )
      .catch(() => undefined);
  }

  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    contentType: row.contentType,
    originalFilename: row.originalFilename,
    createdAt: row.createdAt,
    previewUrl,
    hasThumbnail: Boolean(row.thumbnailKey),
  };
}

export type MediaReviewSummary = {
  pendingCount: number;
  quarantinedCount: number;
  rejectedCount: number;
};

async function mapInConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency = MEDIA_PRESIGN_CONCURRENCY,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      out[current] = await mapper(items[current]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}

async function mapSafeMediaRows(
  rows: MediaGalleryRow[],
): Promise<SafeMediaItem[]> {
  const items = await mapInConcurrency(rows, (row) => toSafeMediaItem(row));
  return items.filter((item): item is SafeMediaItem => item !== null);
}

/**
 * Family-safe media listing (own + co-members), newest first.
 * Prefer `getSafeMediaLibrary` when the UI needs My vs Shared sections.
 */
export async function getSafeMediaForUser(
  userId: string,
  limit = MEDIA_PAGE_SIZE,
): Promise<SafeMediaItem[]> {
  const db = getDb();
  const accessFilter = await getAccessibleMediaFilter(userId);

  const rows = await db
    .select(mediaGalleryColumns)
    .from(media)
    .where(accessFilter)
    .orderBy(desc(media.createdAt))
    .limit(limit);

  return mapSafeMediaRows(rows);
}

export type MediaLibraryScope = "own" | "shared";

/**
 * One page of clean/ready media for a scope (used by load-more API).
 * Optional `q` filters by user tags + AI tags / objects / scenes / captions / filename.
 */
export async function getSafeMediaPage(
  userId: string,
  scope: MediaLibraryScope,
  options?: { limit?: number; offset?: number; q?: string },
): Promise<{ items: SafeMediaItem[]; hasMore: boolean }> {
  const limit = Math.min(
    Math.max(options?.limit ?? MEDIA_PAGE_SIZE, 1),
    MEDIA_PAGE_SIZE,
  );
  const offset = Math.max(options?.offset ?? 0, 0);
  const db = getDb();

  let filter: SQL;
  if (scope === "own") {
    filter = cleanReadyMediaFilter(userId);
  } else {
    const ownerIds = await getAccessibleOwnerIds(userId);
    const sharedOwnerIds = ownerIds.filter((id) => id !== userId);
    if (sharedOwnerIds.length === 0) {
      return { items: [], hasMore: false };
    }
    filter = cleanReadyMediaOwnedByFilter(sharedOwnerIds);
  }

  const tagFilter = visualTagSearchSql(options?.q);
  const where = tagFilter ? and(filter, tagFilter)! : filter;

  const rows = await db
    .select(mediaGalleryColumns)
    .from(media)
    .where(where)
    .orderBy(desc(media.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await mapSafeMediaRows(page);
  return { items, hasMore };
}

/**
 * SQL fragment matching searchable keywords on media (Ask AI + Photos search).
 * Includes AI tags/objects/scenes/captions and manual user_tags.
 * Always AND with clean/ready (+ permission) filters at the call site.
 */
export function visualTagSearchSql(query: string | null | undefined): SQL | null {
  const raw = query?.trim() ?? "";
  if (raw.length < 2) return null;
  const pattern = `%${raw.replace(/[\\%_]/g, (ch) => `\\${ch}`).toLowerCase()}%`;
  return or(
    sql`${media.userTags}::text ilike ${pattern}`,
    sql`${media.aiTags}::text ilike ${pattern}`,
    sql`${media.aiObjects}::text ilike ${pattern}`,
    sql`${media.aiScenes}::text ilike ${pattern}`,
    sql`${media.sceneTags}::text ilike ${pattern}`,
    ilike(media.aiCaption, pattern),
    ilike(media.sceneCaption, pattern),
    ilike(media.originalFilename, pattern),
  )!;
}

/**
 * Split clean/ready media into My Library vs Shared with Family.
 * Two indexed queries (own user_id vs co-member user_ids) keep limits independent.
 * Fetches limit+1 to detect whether another page exists.
 */
export async function getSafeMediaLibrary(
  userId: string,
  options?: {
    ownLimit?: number;
    sharedLimit?: number;
    ownOffset?: number;
    sharedOffset?: number;
  },
): Promise<SafeMediaLibrary> {
  const ownLimit = Math.min(
    Math.max(options?.ownLimit ?? MEDIA_PAGE_SIZE, 1),
    200,
  );
  // `sharedLimit: 0` means skip the shared query (opt-out). Other values
  // clamp to 1–200 like ownLimit.
  const sharedLimitRequested = options?.sharedLimit;
  const sharedLimit =
    sharedLimitRequested === 0
      ? 0
      : Math.min(
          Math.max(sharedLimitRequested ?? MEDIA_PAGE_SIZE, 1),
          200,
        );
  const ownOffset = Math.max(options?.ownOffset ?? 0, 0);
  const sharedOffset = Math.max(options?.sharedOffset ?? 0, 0);
  const db = getDb();

  const ownerIds = await getAccessibleOwnerIds(userId);
  const sharedOwnerIds = ownerIds.filter((id) => id !== userId);
  const hasFamilySharing = sharedOwnerIds.length > 0;

  const ownPromise = db
    .select(mediaGalleryColumns)
    .from(media)
    .where(cleanReadyMediaFilter(userId))
    .orderBy(desc(media.createdAt))
    .limit(ownLimit + 1)
    .offset(ownOffset);

  const sharedPromise =
    hasFamilySharing && sharedLimit > 0
      ? db
          .select(mediaGalleryColumns)
          .from(media)
          .where(cleanReadyMediaOwnedByFilter(sharedOwnerIds))
          .orderBy(desc(media.createdAt))
          .limit(sharedLimit + 1)
          .offset(sharedOffset)
      : Promise.resolve([] as MediaGalleryRow[]);

  const [ownRows, sharedRows] = await Promise.all([ownPromise, sharedPromise]);

  const ownHasMore = ownRows.length > ownLimit;
  const sharedHasMore = sharedRows.length > sharedLimit;
  const ownTrimmed = ownHasMore ? ownRows.slice(0, ownLimit) : ownRows;
  const sharedTrimmed = sharedHasMore
    ? sharedRows.slice(0, sharedLimit)
    : sharedRows;

  const [own, shared] = await Promise.all([
    mapSafeMediaRows(ownTrimmed),
    mapSafeMediaRows(sharedTrimmed),
  ]);

  return {
    own,
    shared,
    hasFamilySharing,
    ownHasMore,
    sharedHasMore,
    pageSize:
      sharedLimit > 0
        ? Math.min(ownLimit, sharedLimit, MEDIA_PAGE_SIZE)
        : Math.min(ownLimit, MEDIA_PAGE_SIZE),
  };
}

/**
 * Subtle counts for review messaging — never expose CSAM specifics in UI copy.
 * Pending = awaiting automated scan OR held for human review.
 * Single pass over the user's media rows (filter aggregates).
 */
export async function getMediaReviewSummary(
  userId: string,
): Promise<MediaReviewSummary> {
  const db = getDb();

  const [row] = await db
    .select({
      pendingCount: sql<number>`count(*) filter (where (
        (${media.moderationStatus} = 'pending' and ${media.status} = 'pending_moderation')
        or ${media.moderationStatus} = 'needs_human_review'
      ))`.mapWith(Number),
      quarantinedCount: sql<number>`count(*) filter (where (
        ${media.moderationStatus} = 'csam_quarantined'
        or ${media.status} = 'csam_quarantined'
      ))`.mapWith(Number),
      rejectedCount: sql<number>`count(*) filter (where (
        ${media.moderationStatus} = 'rejected'
        or ${media.status} = 'rejected'
      ))`.mapWith(Number),
    })
    .from(media)
    .where(eq(media.userId, userId));

  return {
    pendingCount: row?.pendingCount ?? 0,
    quarantinedCount: row?.quarantinedCount ?? 0,
    rejectedCount: row?.rejectedCount ?? 0,
  };
}

/** Count clean/ready media for a user (own library only). */
export async function countOwnSafeMedia(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(media)
    .where(cleanReadyMediaFilter(userId));
  return row?.value ?? 0;
}

/** Clean/ready photos only — source of truth for the Photos journey track. */
export async function countOwnCleanPhotos(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(media)
    .where(
      and(
        cleanReadyMediaFilter(userId),
        eq(media.type, "photo"),
      ),
    );
  return Number(row?.value ?? 0);
}
