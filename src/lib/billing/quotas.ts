/**
 * Storage quota helpers — used bytes, remaining headroom, and upload gates.
 *
 * Plans are currently user-scoped; family helpers aggregate member media for
 * household reporting (and future family-billed plans).
 */

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  familyMembers,
  legacyVideos,
  media,
  privateDocuments,
} from "@/lib/db/schema";
import { DEFAULT_LOCALE, formatNumber, type AppLocale } from "@/lib/i18n";
import { getUserPlan, type PlanLimits } from "@/lib/plans";

export class StorageQuotaError extends Error {
  readonly code = "storage_quota_exceeded" as const;
  readonly usedBytes: number;
  readonly limitBytes: number;
  readonly remainingBytes: number;
  readonly additionalBytes: number;

  constructor(
    message: string,
    detail: {
      usedBytes: number;
      limitBytes: number;
      remainingBytes: number;
      additionalBytes: number;
    },
  ) {
    super(message);
    this.name = "StorageQuotaError";
    this.usedBytes = detail.usedBytes;
    this.limitBytes = detail.limitBytes;
    this.remainingBytes = detail.remainingBytes;
    this.additionalBytes = detail.additionalBytes;
  }
}

export type StorageQuotaScope = "user" | "family";

export type StorageQuotaSnapshot = {
  scope: StorageQuotaScope;
  userId: string | null;
  familyId: string | null;
  usedBytes: number;
  /** Null = unlimited (e.g. Legacy). */
  limitBytes: number | null;
  /** Null when unlimited. */
  remainingBytes: number | null;
  /** 0–100, or null when unlimited. */
  percentUsed: number | null;
  planName: string;
  planSlug: string;
  limits: PlanLimits;
  /** e.g. "142 GB of 300 GB used" */
  label: string;
};

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const KB = 1024;

/**
 * Human-readable byte size (binary units).
 * Numeric portion follows `locale` (default en-US).
 */
export function formatBytes(
  bytes: number,
  fractionDigits = 0,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  const n = Math.max(0, Number(bytes) || 0);
  const fmt = (value: number, digits: number) =>
    formatNumber(value, locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  if (n >= 1024 ** 4) {
    const digits = Math.max(fractionDigits, 1);
    return `${fmt(n / 1024 ** 4, digits)} TB`;
  }
  if (n >= GB) {
    const digits = n >= 10 * GB ? fractionDigits : Math.max(fractionDigits, 1);
    return `${fmt(n / GB, digits)} GB`;
  }
  if (n >= MB) {
    const digits = fractionDigits || (n >= 10 * MB ? 0 : 1);
    return `${fmt(n / MB, digits)} MB`;
  }
  if (n >= KB) return `${fmt(n / KB, 0)} KB`;
  return `${fmt(Math.round(n), 0)} B`;
}

type ByteUnit = "TB" | "GB" | "MB" | "KB" | "B";

function pickSharedUnit(limitBytes: number): ByteUnit {
  if (limitBytes >= 1024 ** 4) return "TB";
  if (limitBytes >= GB) return "GB";
  if (limitBytes >= MB) return "MB";
  if (limitBytes >= KB) return "KB";
  return "B";
}

function toUnit(bytes: number, unit: ByteUnit): string {
  const n = Math.max(0, Number(bytes) || 0);
  switch (unit) {
    case "TB":
      return (n / 1024 ** 4).toFixed(n >= 10 * 1024 ** 4 ? 0 : 1);
    case "GB":
      return (n / GB).toFixed(n >= 10 * GB ? 0 : 1);
    case "MB":
      return (n / MB).toFixed(n >= 10 * MB ? 0 : 1);
    case "KB":
      return (n / KB).toFixed(0);
    default:
      return String(Math.round(n));
  }
}

/**
 * “142 GB of 300 GB used” (same unit for both sides when limited).
 */
export function formatStorageUsageLabel(
  usedBytes: number,
  limitBytes: number | null,
): string {
  if (limitBytes == null || limitBytes <= 0) {
    return `${formatBytes(usedBytes, 1)} used (unlimited)`;
  }
  const unit = pickSharedUnit(limitBytes);
  return `${toUnit(usedBytes, unit)} ${unit} of ${toUnit(limitBytes, unit)} ${unit} used`;
}

function buildSnapshot(input: {
  scope: StorageQuotaScope;
  userId: string | null;
  familyId: string | null;
  usedBytes: number;
  limits: PlanLimits;
}): StorageQuotaSnapshot {
  const usedBytes = Math.max(0, Math.floor(input.usedBytes));
  const limitBytes = input.limits.storageLimitBytes;
  const remainingBytes =
    limitBytes == null ? null : Math.max(0, limitBytes - usedBytes);
  const percentUsed =
    limitBytes == null || limitBytes <= 0
      ? null
      : Math.min(100, Math.round((usedBytes / limitBytes) * 1000) / 10);

  return {
    scope: input.scope,
    userId: input.userId,
    familyId: input.familyId,
    usedBytes,
    limitBytes,
    remainingBytes,
    percentUsed,
    planName: input.limits.name,
    planSlug: String(input.limits.slug),
    limits: input.limits,
    label: formatStorageUsageLabel(usedBytes, limitBytes),
  };
}

/**
 * Bytes currently counted toward a user's vault storage.
 * Gallery media (excluding CSAM quarantine) + private documents + legacy videos.
 */
export async function getUserStorageUsedBytes(userId: string): Promise<number> {
  if (!userId?.trim()) return 0;
  const db = getDb();
  const [[mediaRow], [docRow], [videoRow]] = await Promise.all([
    db
      .select({
        bytes: sql<number>`coalesce(sum(${media.byteSize}), 0)`,
      })
      .from(media)
      .where(
        and(eq(media.userId, userId), ne(media.status, "csam_quarantined")),
      ),
    db
      .select({
        bytes: sql<number>`coalesce(sum(${privateDocuments.sizeBytes}), 0)`,
      })
      .from(privateDocuments)
      .where(eq(privateDocuments.userId, userId)),
    db
      .select({
        bytes: sql<number>`coalesce(sum(${legacyVideos.sizeBytes}), 0)`,
      })
      .from(legacyVideos)
      .where(eq(legacyVideos.userId, userId)),
  ]);
  return (
    Number(mediaRow?.bytes ?? 0) +
    Number(docRow?.bytes ?? 0) +
    Number(videoRow?.bytes ?? 0)
  );
}

/**
 * Active member user ids for a family (skips pending invites without accounts).
 */
export async function getFamilyActiveMemberUserIds(
  familyId: string,
): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: familyMembers.userId })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.status, "active"),
      ),
    );
  return rows
    .map((r) => r.userId)
    .filter((id): id is string => Boolean(id?.trim()));
}

/**
 * Sum of storage used by all active members of a family
 * (gallery media + each member's private documents and legacy videos).
 */
export async function getFamilyStorageUsedBytes(
  familyId: string,
): Promise<number> {
  if (!familyId?.trim()) return 0;
  const memberIds = await getFamilyActiveMemberUserIds(familyId);
  if (memberIds.length === 0) return 0;

  const db = getDb();
  const [[mediaRow], [docRow], [videoRow]] = await Promise.all([
    db
      .select({
        bytes: sql<number>`coalesce(sum(${media.byteSize}), 0)`,
      })
      .from(media)
      .where(
        and(
          inArray(media.userId, memberIds),
          ne(media.status, "csam_quarantined"),
        ),
      ),
    db
      .select({
        bytes: sql<number>`coalesce(sum(${privateDocuments.sizeBytes}), 0)`,
      })
      .from(privateDocuments)
      .where(inArray(privateDocuments.userId, memberIds)),
    db
      .select({
        bytes: sql<number>`coalesce(sum(${legacyVideos.sizeBytes}), 0)`,
      })
      .from(legacyVideos)
      .where(inArray(legacyVideos.userId, memberIds)),
  ]);
  return (
    Number(mediaRow?.bytes ?? 0) +
    Number(docRow?.bytes ?? 0) +
    Number(videoRow?.bytes ?? 0)
  );
}

/**
 * Current storage usage + plan limit for a user.
 */
export async function getStorageQuotaForUser(
  userId: string,
): Promise<StorageQuotaSnapshot> {
  if (!userId?.trim()) {
    throw new Error("userId is required.");
  }
  const [{ limits }, usedBytes] = await Promise.all([
    getUserPlan(userId),
    getUserStorageUsedBytes(userId),
  ]);
  return buildSnapshot({
    scope: "user",
    userId,
    familyId: null,
    usedBytes,
    limits,
  });
}

/**
 * Aggregated family storage vs the given billing user's plan limits
 * (typically the family owner — household billing still uses user-scoped plans).
 */
export async function getStorageQuotaForFamily(
  familyId: string,
  billingUserId: string,
): Promise<StorageQuotaSnapshot> {
  if (!familyId?.trim() || !billingUserId?.trim()) {
    throw new Error("familyId and billingUserId are required.");
  }
  const [{ limits }, usedBytes] = await Promise.all([
    getUserPlan(billingUserId),
    getFamilyStorageUsedBytes(familyId),
  ]);
  return buildSnapshot({
    scope: "family",
    userId: billingUserId,
    familyId,
    usedBytes,
    limits,
  });
}

/**
 * Remaining bytes before hitting the limit (null = unlimited).
 */
export function getRemainingStorageBytes(
  snapshot: StorageQuotaSnapshot,
): number | null {
  return snapshot.remainingBytes;
}

/**
 * True when `additionalBytes` would fit under the plan limit.
 */
export function canAcceptUpload(
  snapshot: StorageQuotaSnapshot,
  additionalBytes: number,
): boolean {
  const add = Math.max(0, Math.floor(additionalBytes));
  if (snapshot.limitBytes == null) return true;
  return snapshot.usedBytes + add <= snapshot.limitBytes;
}

/**
 * Check whether a new upload of `additionalBytes` fits the user's plan.
 * Does not throw — returns `{ ok, snapshot, remainingBytes }`.
 */
export async function checkUploadFitsQuota(
  userId: string,
  additionalBytes: number,
): Promise<{
  ok: boolean;
  snapshot: StorageQuotaSnapshot;
  remainingBytes: number | null;
}> {
  const snapshot = await getStorageQuotaForUser(userId);
  const ok = canAcceptUpload(snapshot, additionalBytes);
  return {
    ok,
    snapshot,
    remainingBytes: snapshot.remainingBytes,
  };
}

/**
 * Throw StorageQuotaError when the upload would exceed the plan limit.
 */
export async function assertUploadWithinStorageQuota(
  userId: string,
  additionalBytes: number,
): Promise<StorageQuotaSnapshot> {
  const add = Math.max(0, Math.floor(additionalBytes));
  const snapshot = await getStorageQuotaForUser(userId);

  if (snapshot.limitBytes == null) {
    return snapshot;
  }

  if (snapshot.usedBytes + add > snapshot.limitBytes) {
    const remaining = Math.max(0, snapshot.limitBytes - snapshot.usedBytes);
    throw new StorageQuotaError(
      remaining <= 0
        ? `Your ${snapshot.planName} storage is full. Free up space or upgrade to keep uploading.`
        : `This file is a bit too large for the space you have left on ${snapshot.planName} (${formatBytes(remaining, 1)} remaining). Try a smaller file, remove older photos, or upgrade your plan.`,
      {
        usedBytes: snapshot.usedBytes,
        limitBytes: snapshot.limitBytes,
        remainingBytes: remaining,
        additionalBytes: add,
      },
    );
  }

  return snapshot;
}
