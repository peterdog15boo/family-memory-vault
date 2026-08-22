import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { downloadRemoteFile } from "@/lib/media/import/cloud";
import { sha256HexFromBytes } from "@/lib/media/import/content-hash";
import {
  finalizeUploadedMedia,
  StorageQuotaError,
} from "@/lib/media/import/ingest";
import { buildTempUploadKey, putTempObjectBytes } from "@/lib/r2";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import {
  isR2Configured,
  resolveUploadContentType,
} from "@/lib/upload/constants";
import { z } from "zod";

const importSchema = z.object({
  provider: z.enum(["google_drive", "dropbox"]),
  fileIds: z.array(z.string().min(1).max(512)).min(1).max(25),
  attachMemoryId: z.string().min(1).max(64).optional().nullable(),
});

/**
 * POST /api/media/import/fetch — download selected remote files into the vault pipeline.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `media-import:${userId}`,
    RATE_LIMITS.mediaComplete.limit,
    RATE_LIMITS.mediaComplete.windowMs,
  );
  if (limited) return limited;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Object storage is not configured.", code: "r2_not_configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { provider, fileIds, attachMemoryId } = parsed.data;
  const imported: Array<{
    mediaId: string;
    fileId: string;
    deduped: boolean;
    status: string;
  }> = [];
  const failures: Array<{ fileId: string; error: string }> = [];

  for (const fileId of fileIds) {
    try {
      const file = await downloadRemoteFile(userId, provider, fileId);
      const resolved = resolveUploadContentType({
        filename: file.name,
        contentType: file.mimeType,
      });
      if (!resolved) {
        failures.push({
          fileId,
          error: "Unsupported file type for vault import.",
        });
        continue;
      }

      const key = buildTempUploadKey(userId, file.name);
      await putTempObjectBytes(key, file.body, { contentType: resolved });
      const contentHash = sha256HexFromBytes(file.body);

      const result = await finalizeUploadedMedia({
        userId,
        key,
        filename: file.name,
        contentType: resolved,
        declaredSize: file.body.byteLength,
        attachMemoryId: attachMemoryId ?? null,
        importProvider: provider,
        importExternalId: fileId,
        contentHash,
        source: `api.media.import.${provider}`,
      });

      imported.push({
        mediaId: result.mediaId,
        fileId,
        deduped: result.deduped,
        status: result.status,
      });
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            imported,
            failures,
          },
          { status: 403 },
        );
      }
      failures.push({
        fileId,
        error: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  return NextResponse.json({
    imported,
    failures,
    message:
      "Selected files were queued for safety checks before they appear in your library.",
  });
}
