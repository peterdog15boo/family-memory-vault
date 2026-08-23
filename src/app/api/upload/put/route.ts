import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { putTempObjectBytes } from "@/lib/r2";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import {
  isR2Configured,
  maxBytesForContentType,
  fileTooLargeMessage,
  canProxyUploadBytes,
  MAX_PROXY_UPLOAD_BYTES,
  formatUploadLimit,
  resolveUploadContentType,
} from "@/lib/upload/constants";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * PUT /api/upload/put?key=temp/{userId}/…
 *
 * Same-origin proxy for browser uploads when R2 CORS blocks direct PUT
 * (typical on iPhone over LAN: Origin http://192.168.x.x:3000).
 *
 * Body: raw file bytes. Header Content-Type must match an allowed upload type
 * (or be inferable from the key extension).
 */
export async function PUT(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `upload-put:${userId}`,
    RATE_LIMITS.uploadPut.limit,
    RATE_LIMITS.uploadPut.windowMs,
  );
  if (limited) return limited;

  if (!isR2Configured()) {
    return NextResponse.json(
      {
        error:
          "Object storage is not configured yet. Add R2 credentials to .env.local.",
        code: "r2_not_configured",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  if (!key) {
    return NextResponse.json(
      { error: "Missing upload key.", code: "validation" },
      { status: 400 },
    );
  }

  const expectedPrefix = `temp/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    return NextResponse.json(
      {
        error: "Upload key does not belong to the authenticated user.",
        code: "forbidden",
      },
      { status: 403 },
    );
  }

  const filename = key.split("/").pop() || "upload.bin";
  const headerType = request.headers.get("content-type");
  const contentType = resolveUploadContentType({
    filename,
    contentType: headerType,
  });
  if (!contentType) {
    console.warn("[api.upload.put] unsupported content type", {
      userId,
      key,
      headerType,
    });
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Use JPEG, PNG, WebP, HEIC, MP4, MOV, or WebM.",
        code: "unsupported_type",
      },
      { status: 400 },
    );
  }

  const maxBytes = maxBytesForContentType(contentType);
  const declaredLength = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declaredLength) && !canProxyUploadBytes(declaredLength)) {
    return NextResponse.json(
      {
        error:
          `This file is too large for the backup upload path (max ${formatUploadLimit(MAX_PROXY_UPLOAD_BYTES)}). ` +
          "Large videos must upload directly to storage — confirm R2 CORS allows your site origin for PUT, then try again.",
        code: "proxy_too_large",
        maxProxyBytes: MAX_PROXY_UPLOAD_BYTES,
      },
      { status: 413 },
    );
  }
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return NextResponse.json(
      {
        error: fileTooLargeMessage(contentType, maxBytes),
        code: "file_too_large",
        maxBytes,
      },
      { status: 400 },
    );
  }

  try {
    const body = Buffer.from(await request.arrayBuffer());
    if (body.byteLength <= 0) {
      return NextResponse.json(
        { error: "Uploaded body is empty.", code: "validation" },
        { status: 400 },
      );
    }
    if (!canProxyUploadBytes(body.byteLength)) {
      return NextResponse.json(
        {
          error:
            `This file is too large for the backup upload path (max ${formatUploadLimit(MAX_PROXY_UPLOAD_BYTES)}). ` +
            "Large videos must upload directly to storage — confirm R2 CORS allows your site origin for PUT, then try again.",
          code: "proxy_too_large",
          maxProxyBytes: MAX_PROXY_UPLOAD_BYTES,
        },
        { status: 413 },
      );
    }
    if (body.byteLength > maxBytes) {
      return NextResponse.json(
        {
          error: fileTooLargeMessage(contentType, maxBytes),
          code: "file_too_large",
          maxBytes,
        },
        { status: 400 },
      );
    }

    const uploaded = await putTempObjectBytes(key, body, { contentType });
    console.info("[api.upload.put] proxied temp upload", {
      userId,
      key,
      contentType,
      byteSize: uploaded.byteSize,
    });

    return NextResponse.json({
      ok: true,
      key: uploaded.key,
      byteSize: uploaded.byteSize,
      contentType,
      via: "proxy",
    });
  } catch (error) {
    console.error("[api.upload.put] failed", {
      userId,
      key,
      contentType,
      error,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not upload file to storage.",
        code: "internal",
      },
      { status: 500 },
    );
  }
}
