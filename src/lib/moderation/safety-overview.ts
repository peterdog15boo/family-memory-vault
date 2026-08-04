/**
 * Admin safety overview queries.
 * Metadata only — never signs download URLs for quarantined / CSAM items.
 */

import {
  and,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { assertAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import {
  media,
  moderationEvents,
  users,
  type Media,
} from "@/lib/db/schema";
import type { ModerationStatus } from "@/lib/moderation/types";
import { MODERATION_STATUSES } from "@/lib/moderation/types";
import { likeContainsPattern } from "@/lib/security/sanitize";

export type SafetyStatusCounts = Record<ModerationStatus, number> & {
  total: number;
};

export type SafetyListItem = {
  id: string;
  userId: string;
  ownerEmail: string | null;
  type: Media["type"];
  contentType: string;
  originalFilename: string | null;
  moderationStatus: Media["moderationStatus"];
  status: Media["status"];
  photodnaMatch: boolean;
  aiCsamScore: number | null;
  aiNudityScore: number | null;
  quarantinedAt: Date | null;
  ncmecReportId: string | null;
  ncmecReportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SafetyOverviewFilter =
  | ModerationStatus
  | "all"
  | "quarantined"
  | "needs_review"
  | "ncmec_reported";

export type SafetyListQuery = {
  filter?: SafetyOverviewFilter;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type SafetyMediaInspect = {
  id: string;
  userId: string;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
  type: Media["type"];
  contentType: string;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  originalFilename: string | null;
  moderationStatus: Media["moderationStatus"];
  status: Media["status"];
  photodnaMatch: boolean;
  aiCsamScore: number | null;
  aiNudityScore: number | null;
  moderationLabels: Media["moderationLabels"];
  quarantinedAt: Date | null;
  ncmecReportId: string | null;
  ncmecReportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Safe storage hints — never full signed URLs. */
  storage: {
    underQuarantinePrefix: boolean;
    keyHint: string | null;
    hasProcessedDerivative: boolean;
    hasThumbnail: boolean;
  };
  /** True when content preview must never be offered. */
  contentBlocked: boolean;
  recentEvents: Array<{
    id: string;
    eventType: string;
    source: string;
    actorId: string | null;
    actorEmail: string | null;
    previousModerationStatus: string | null;
    newModerationStatus: string | null;
    notes: string | null;
    createdAt: Date;
  }>;
};

export type AdminModerationAction = {
  id: string;
  mediaId: string;
  filename: string | null;
  eventType: string;
  source: string;
  actorId: string | null;
  actorEmail: string | null;
  newModerationStatus: string | null;
  notes: string | null;
  createdAt: Date;
};

function emptyCounts(): SafetyStatusCounts {
  const base = Object.fromEntries(
    MODERATION_STATUSES.map((s) => [s, 0]),
  ) as Record<ModerationStatus, number>;
  return { ...base, total: 0 };
}

const listSelect = {
  id: media.id,
  userId: media.userId,
  ownerEmail: users.email,
  type: media.type,
  contentType: media.contentType,
  originalFilename: media.originalFilename,
  moderationStatus: media.moderationStatus,
  status: media.status,
  photodnaMatch: media.photodnaMatch,
  aiCsamScore: media.aiCsamScore,
  aiNudityScore: media.aiNudityScore,
  quarantinedAt: media.quarantinedAt,
  ncmecReportId: media.ncmecReportId,
  ncmecReportedAt: media.ncmecReportedAt,
  createdAt: media.createdAt,
  updatedAt: media.updatedAt,
};

function filterWhere(filter: SafetyOverviewFilter): SQL | undefined {
  if (filter === "all") return undefined;
  if (filter === "quarantined") {
    return eq(media.moderationStatus, "csam_quarantined");
  }
  if (filter === "needs_review") {
    return eq(media.moderationStatus, "needs_human_review");
  }
  if (filter === "ncmec_reported") {
    return and(isNotNull(media.ncmecReportId), sql`${media.ncmecReportId} <> ''`);
  }
  if ((MODERATION_STATUSES as readonly string[]).includes(filter)) {
    return eq(media.moderationStatus, filter as ModerationStatus);
  }
  return undefined;
}

function searchWhere(q: string | undefined): SQL | undefined {
  const pattern = likeContainsPattern(q);
  if (!pattern) return undefined;
  return or(
    ilike(media.originalFilename, pattern),
    ilike(media.id, pattern),
    ilike(media.userId, pattern),
    ilike(users.email, pattern),
  );
}

/** Redact object keys for admin UI — never expose full paths for CSAM. */
export function redactStorageKey(
  key: string | null | undefined,
  contentBlocked: boolean,
): string | null {
  if (!key?.trim()) return null;
  if (contentBlocked) {
    const under = key.startsWith("quarantine/");
    return under ? "quarantine/•••• (redacted)" : "•••• (redacted)";
  }
  if (key.length <= 48) return key;
  return `${key.slice(0, 24)}…${key.slice(-12)}`;
}

/**
 * Append an admin audit row for safety/review tooling.
 */
export async function logAdminModerationAction(options: {
  actorUserId: string;
  mediaId: string;
  eventType: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  previousModerationStatus?: string | null;
  newModerationStatus?: string | null;
}): Promise<void> {
  await assertAdminUser(options.actorUserId);
  const db = getDb();
  await db.insert(moderationEvents).values({
    id: nanoid(),
    mediaId: options.mediaId,
    eventType: options.eventType,
    source: "admin.safety",
    previousModerationStatus: options.previousModerationStatus ?? null,
    newModerationStatus: options.newModerationStatus ?? null,
    actorId: options.actorUserId,
    notes: options.notes?.trim() || null,
    metadata: options.metadata ?? {},
    createdAt: new Date(),
  });
}

export async function getSafetyStatusCounts(
  actorUserId: string,
): Promise<SafetyStatusCounts> {
  await assertAdminUser(actorUserId);
  const db = getDb();

  const rows = await db
    .select({
      moderationStatus: media.moderationStatus,
      value: count(),
    })
    .from(media)
    .groupBy(media.moderationStatus);

  const counts = emptyCounts();
  for (const row of rows) {
    counts[row.moderationStatus] = row.value;
    counts.total += row.value;
  }
  return counts;
}

export async function listRecentQuarantinedMedia(
  actorUserId: string,
  limit = 15,
): Promise<SafetyListItem[]> {
  const result = await listSafetyOverviewMedia(actorUserId, {
    filter: "quarantined",
    page: 1,
    pageSize: limit,
  });
  return result.items;
}

export async function listRecentNcmecReports(
  actorUserId: string,
  limit = 15,
): Promise<SafetyListItem[]> {
  const result = await listSafetyOverviewMedia(actorUserId, {
    filter: "ncmec_reported",
    page: 1,
    pageSize: limit,
  });
  return result.items;
}

/**
 * Filtered + paginated media list for the safety overview table.
 */
export async function listSafetyOverviewMedia(
  actorUserId: string,
  query: SafetyListQuery = {},
): Promise<{
  items: SafetyListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  await assertAdminUser(actorUserId);

  const filter = query.filter ?? "all";
  const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  const whereParts = [filterWhere(filter), searchWhere(query.q)].filter(
    Boolean,
  ) as SQL[];
  const where =
    whereParts.length === 0
      ? undefined
      : whereParts.length === 1
        ? whereParts[0]
        : and(...whereParts);

  const db = getDb();

  const base = db
    .select(listSelect)
    .from(media)
    .leftJoin(users, eq(media.userId, users.id));

  const items = await (where ? base.where(where) : base)
    .orderBy(desc(media.updatedAt))
    .limit(pageSize)
    .offset(offset);

  const [totalRow] = await db
    .select({ value: count() })
    .from(media)
    .leftJoin(users, eq(media.userId, users.id))
    .where(where ?? sql`true`);

  const total = Number(totalRow?.value ?? 0);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Metadata-only inspection for any media row.
 * Quarantined / CSAM items never expose content or usable storage URLs.
 */
export async function getSafetyMediaInspect(
  actorUserId: string,
  mediaId: string,
  options?: { logInspect?: boolean },
): Promise<SafetyMediaInspect | null> {
  await assertAdminUser(actorUserId);
  const db = getDb();

  const [row] = await db
    .select({
      id: media.id,
      userId: media.userId,
      ownerEmail: users.email,
      ownerDisplayName: users.displayName,
      type: media.type,
      contentType: media.contentType,
      byteSize: media.byteSize,
      width: media.width,
      height: media.height,
      durationMs: media.durationMs,
      originalFilename: media.originalFilename,
      moderationStatus: media.moderationStatus,
      status: media.status,
      photodnaMatch: media.photodnaMatch,
      aiCsamScore: media.aiCsamScore,
      aiNudityScore: media.aiNudityScore,
      moderationLabels: media.moderationLabels,
      quarantinedAt: media.quarantinedAt,
      ncmecReportId: media.ncmecReportId,
      ncmecReportedAt: media.ncmecReportedAt,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
      originalKey: media.originalKey,
      processedKey: media.processedKey,
      thumbnailKey: media.thumbnailKey,
    })
    .from(media)
    .leftJoin(users, eq(media.userId, users.id))
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) return null;

  const contentBlocked =
    row.moderationStatus === "csam_quarantined" ||
    row.status === "csam_quarantined" ||
    Boolean(row.originalKey?.startsWith("quarantine/"));

  const events = await db
    .select({
      id: moderationEvents.id,
      eventType: moderationEvents.eventType,
      source: moderationEvents.source,
      actorId: moderationEvents.actorId,
      actorEmail: users.email,
      previousModerationStatus: moderationEvents.previousModerationStatus,
      newModerationStatus: moderationEvents.newModerationStatus,
      notes: moderationEvents.notes,
      createdAt: moderationEvents.createdAt,
    })
    .from(moderationEvents)
    .leftJoin(users, eq(moderationEvents.actorId, users.id))
    .where(eq(moderationEvents.mediaId, mediaId))
    .orderBy(desc(moderationEvents.createdAt))
    .limit(40);

  if (options?.logInspect !== false) {
    await logAdminModerationAction({
      actorUserId,
      mediaId,
      eventType: "admin.inspect",
      notes: contentBlocked
        ? "Inspected quarantined item (metadata only)."
        : "Inspected media metadata.",
      previousModerationStatus: row.moderationStatus,
      newModerationStatus: row.moderationStatus,
      metadata: { contentBlocked },
    });
  }

  return {
    id: row.id,
    userId: row.userId,
    ownerEmail: row.ownerEmail,
    ownerDisplayName: row.ownerDisplayName,
    type: row.type,
    contentType: row.contentType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    originalFilename: row.originalFilename,
    moderationStatus: row.moderationStatus,
    status: row.status,
    photodnaMatch: row.photodnaMatch,
    aiCsamScore: row.aiCsamScore,
    aiNudityScore: row.aiNudityScore,
    moderationLabels: row.moderationLabels,
    quarantinedAt: row.quarantinedAt,
    ncmecReportId: row.ncmecReportId,
    ncmecReportedAt: row.ncmecReportedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    storage: {
      underQuarantinePrefix: Boolean(row.originalKey?.startsWith("quarantine/")),
      keyHint: redactStorageKey(row.originalKey, contentBlocked),
      hasProcessedDerivative: Boolean(row.processedKey),
      hasThumbnail: Boolean(row.thumbnailKey),
    },
    contentBlocked,
    recentEvents: events,
  };
}

export async function listRecentAdminModerationActions(
  actorUserId: string,
  limit = 20,
): Promise<AdminModerationAction[]> {
  await assertAdminUser(actorUserId);
  const db = getDb();
  const capped = Math.min(Math.max(limit, 1), 50);

  const rows = await db
    .select({
      id: moderationEvents.id,
      mediaId: moderationEvents.mediaId,
      filename: media.originalFilename,
      eventType: moderationEvents.eventType,
      source: moderationEvents.source,
      actorId: moderationEvents.actorId,
      actorEmail: users.email,
      newModerationStatus: moderationEvents.newModerationStatus,
      notes: moderationEvents.notes,
      createdAt: moderationEvents.createdAt,
    })
    .from(moderationEvents)
    .innerJoin(media, eq(moderationEvents.mediaId, media.id))
    .leftJoin(users, eq(moderationEvents.actorId, users.id))
    .where(
      or(
        eq(moderationEvents.source, "admin.review"),
        eq(moderationEvents.source, "admin.safety"),
        sql`${moderationEvents.eventType} like 'admin.%'`,
        sql`${moderationEvents.eventType} like 'moderation.human_review%'`,
      ),
    )
    .orderBy(desc(moderationEvents.createdAt))
    .limit(capped);

  return rows;
}

export function parseSafetyFilter(
  value: string | string[] | undefined,
): SafetyOverviewFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw === "all") return "all";
  if (raw === "quarantined" || raw === "csam_quarantined") return "quarantined";
  if (raw === "needs_review" || raw === "needs_human_review") return "needs_review";
  if (raw === "ncmec_reported") return "ncmec_reported";
  if ((MODERATION_STATUSES as readonly string[]).includes(raw)) {
    return raw as ModerationStatus;
  }
  return "all";
}

export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}
