import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAppUrl } from "@/lib/env";
import { upsertMediaConnection } from "@/lib/media/import/connections";
import { isOAuthImportProvider } from "@/lib/media/import/providers";
import {
  decodeOAuthState,
  exchangeDropboxCode,
  exchangeGoogleDriveCode,
} from "@/lib/media/import/oauth";
import { ensureAppUser } from "@/lib/users";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

function redirectWithNotice(
  returnTo: string,
  notice: string,
  extra?: Record<string, string>,
) {
  const url = new URL(returnTo, getAppUrl());
  url.searchParams.set("import", notice);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      url.searchParams.set(k, v);
    }
  }
  return NextResponse.redirect(url);
}

/**
 * GET /api/media/import/oauth/[provider]/callback
 */
export async function GET(request: Request, context: RouteContext) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    return NextResponse.redirect(new URL("/", getAppUrl()));
  }

  const { provider: rawProvider } = await context.params;
  if (!isOAuthImportProvider(rawProvider)) {
    return redirectWithNotice("/media", "error");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const state = stateRaw ? decodeOAuthState(stateRaw) : null;
  const returnTo = state?.returnTo || "/media";

  if (oauthError) {
    return redirectWithNotice(returnTo, "denied");
  }
  if (!code || !state || state.userId !== userId || state.provider !== rawProvider) {
    return redirectWithNotice(returnTo, "error");
  }

  try {
    await ensureAppUser(userId);

    const tokens =
      rawProvider === "google_drive"
        ? await exchangeGoogleDriveCode(code)
        : rawProvider === "dropbox"
          ? await exchangeDropboxCode(code)
          : null;

    if (!tokens) {
      return redirectWithNotice(returnTo, "unavailable");
    }

    await upsertMediaConnection({
      userId,
      provider: rawProvider,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      accountLabel: tokens.accountLabel,
      externalAccountId: tokens.externalAccountId,
      scopes:
        rawProvider === "google_drive"
          ? ["https://www.googleapis.com/auth/drive.readonly"]
          : ["files.content.read"],
    });

    return redirectWithNotice(returnTo, "connected", {
      provider: rawProvider,
      ...(state.memoryId ? { memoryId: state.memoryId } : {}),
      ...(state.attachToMemory ? { attach: "1" } : {}),
    });
  } catch (error) {
    console.error("[media.import.oauth.callback] failed", error);
    return redirectWithNotice(returnTo, "error");
  }
}
