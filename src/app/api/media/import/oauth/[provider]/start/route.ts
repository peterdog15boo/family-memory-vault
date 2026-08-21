import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getAppUrl } from "@/lib/env";
import {
  isDropboxImportConfigured,
  isGoogleDriveImportConfigured,
  isOAuthImportProvider,
} from "@/lib/media/import/providers";
import {
  buildDropboxAuthUrl,
  buildGoogleDriveAuthUrl,
  createOAuthNonce,
  encodeOAuthState,
} from "@/lib/media/import/oauth";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

const startSchema = z.object({
  returnTo: z.string().max(500).optional(),
  memoryId: z.string().min(1).max(64).optional().nullable(),
  attachToMemory: z.boolean().optional(),
});

function safeReturnTo(value: string | undefined): string {
  const fallback = "/media";
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value.slice(0, 500);
}

/**
 * POST /api/media/import/oauth/[provider]/start
 * Returns an official OAuth URL (Drive / Dropbox). Meta/TikTok stay unavailable.
 */
export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { provider: rawProvider } = await context.params;
  if (!isOAuthImportProvider(rawProvider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (rawProvider === "google_drive" && !isGoogleDriveImportConfigured()) {
    return NextResponse.json(
      {
        error: "Google Drive import is not configured.",
        code: "needs_config",
      },
      { status: 503 },
    );
  }
  if (rawProvider === "dropbox" && !isDropboxImportConfigured()) {
    return NextResponse.json(
      {
        error: "Dropbox import is not configured.",
        code: "needs_config",
      },
      { status: 503 },
    );
  }
  if (
    rawProvider === "facebook" ||
    rawProvider === "instagram" ||
    rawProvider === "tiktok"
  ) {
    return NextResponse.json(
      {
        error:
          "This provider does not support direct library import yet. Use device upload or a guided export.",
        code: "unavailable",
      },
      { status: 503 },
    );
  }

  const state = encodeOAuthState({
    userId,
    provider: rawProvider,
    returnTo: safeReturnTo(parsed.data.returnTo),
    memoryId: parsed.data.memoryId ?? null,
    attachToMemory: Boolean(parsed.data.attachToMemory && parsed.data.memoryId),
    nonce: createOAuthNonce(),
  });

  const authUrl =
    rawProvider === "google_drive"
      ? buildGoogleDriveAuthUrl(state)
      : buildDropboxAuthUrl(state);

  return NextResponse.json({
    authUrl,
    provider: rawProvider,
    appUrl: getAppUrl(),
  });
}
