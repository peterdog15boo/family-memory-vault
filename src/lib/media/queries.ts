import { and, count, desc, eq, inArray, sql, SQL } from "drizzle-orm";
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

async function mapSafeMediaRows(
  rows: MediaGalleryRow[],
): Promise<SafeMediaItem[]> {
  const items = await Promise.all(rows.map((row) => toSafeMediaItem(row)));
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
 */
export async function getSafeMediaPage(
  userId: string,
  scope: MediaLibraryScope,
  options?: { limit?: number; offset?: number },
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

  const rows = await db
    .select(mediaGalleryColumns)
    .from(media)
    .where(filter)
    .orderBy(desc(media.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await mapSafeMediaRows(page);
  return { items, hasMore };
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
  const sharedLimit = Math.min(
    Math.max(options?.sharedLimit ?? MEDIA_PAGE_SIZE, 1),
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

  const sharedPromise = hasFamilySharing
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
    pageSize: Math.min(ownLimit, sharedLimit, MEDIA_PAGE_SIZE),
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
