import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import {
  StorageQuotaError,
  assertUploadWithinStorageQuota,
} from "@/lib/billing/quotas";
import { LEGACY_VIDEO_SECTION_TYPES } from "@/lib/db/schema";
import {
  createLegacyVideo,
  listLegacyVideos,
  listLegacyVideosBySection,
} from "@/lib/legacy/videos";
import { serializeLegacyVideo } from "@/lib/legacy/serialize";
import type { LegacyVideoSectionType } from "@/lib/legacy/types";
import {
  LEGACY_VIDEO_MAX_BYTES,
  assertAllowedLegacyVideoUpload,
  buildLegacyVideoThumbnailKey,
  deleteLegacyVideoObjects,
  generateLegacyVideoThumbnail,
  promoteLegacyVideoTempToPermanent,
} from "@/lib/legacy/video-storage";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { isR2Configured } from "@/lib/upload/constants";
import { ensureAppUser } from "@/lib/users";

const completeSchema = z.object({
  tempKey: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(3).max(120),
  size: z.number().int().positive().max(LEGACY_VIDEO_MAX_BYTES),
  sectionType: z.enum(LEGACY_VIDEO_SECTION_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  sourceType: z.enum(["recorded", "uploaded"]).default("uploaded"),
  durationSeconds: z.number().int().min(0).max(86_400).optional().nullable(),
  legacyInstructionId: z.string().min(1).max(64).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

/**
 * GET /api/legacy/videos?section=message_to_loved_ones
 * Owner-only list — metadata only.
 * Never batch-signs playback or thumbnail URLs (use POST .../playback).
 */
export async function GET(request: Request) {
  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const url = new URL(request.url);
  const section = url.searchParams.get("section")?.trim();

  const sectionType =
    section &&
    (LEGACY_VIDEO_SECTION_TYPES as readonly string[]).includes(section)
      ? (section as LegacyVideoSectionType)
      : undefined;

  try {
    const rows = sectionType
      ? await listLegacyVideosBySection(userId, sectionType)
      : await listLegacyVideos(userId);

    return NextResponse.json({
      videos: rows.map((row) => serializeLegacyVideo(row)),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to list legacy videos");
  }
}

/**
 * POST /api/legacy/videos — promote temp upload + create DB row.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-videos-complete:${userId}`,
    RATE_LIMITS.legacyVideosComplete.limit,
    RATE_LIMITS.legacyVideosComplete.windowMs,
  );
  if (limited) return limited;

  if (!isR2Configured()) {
    return apiError(
      "Object storage is not configured yet. Add R2 credentials to .env.local.",
      { status: 503, code: "r2_not_configured" },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid video request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;
  let contentType: string;
  try {
    contentType = assertAllowedLegacyVideoUpload({
      contentType: input.contentType,
      sizeBytes: input.size,
      filename: input.filename,
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Unsupported video type");
  }

  const videoId = nanoid();
  let promotedKey: string | null = null;
  let thumbnailKey: string | null = null;

  try {
    await ensureAppUser(userId);
    await assertUploadWithinStorageQuota(userId, input.size);

    const promoted = await promoteLegacyVideoTempToPermanent({
      userId,
      videoId,
      tempKey: input.tempKey,
      filename: input.filename,
      expectedContentType: contentType,
      expectedSizeBytes: input.size,
    });
    promotedKey = promoted.toKey;

    const thumb = await generateLegacyVideoThumbnail({
      userId,
      videoId,
      storageKey: promoted.toKey,
      contentType,
    });
    thumbnailKey = thumb.thumbnailKey;

    const row = await createLegacyVideo({
      id: videoId,
      userId,
      sectionType: input.sectionType,
      title: input.title,
      description: input.description,
      storageKey: promoted.toKey,
      thumbnailKey: thumb.thumbnailKey,
      contentType,
      sizeBytes: promoted.sizeBytes,
      sourceType: input.sourceType,
      durationSeconds: input.durationSeconds,
      legacyInstructionId: input.legacyInstructionId,
      sortOrder: input.sortOrder,
    });

    return NextResponse.json({
      video: serializeLegacyVideo(row),
    });
  } catch (error) {
    if (promotedKey) {
      try {
        await deleteLegacyVideoObjects({
          userId,
          videoId,
          storageKey: promotedKey,
          thumbnailKey:
            thumbnailKey ?? buildLegacyVideoThumbnailKey(userId, videoId),
        });
      } catch {
        // best-effort cleanup
      }
    } else {
      try {
        await deleteLegacyVideoObjects({
          userId,
          tempKey: input.tempKey,
        });
      } catch {
        // best-effort
      }
    }

    if (error instanceof StorageQuotaError) {
      return apiError(error.message, {
        status: 403,
        code: "storage_quota_exceeded",
      });
    }
    return apiErrorFromUnknown(error, "Failed to save legacy video");
  }
}
