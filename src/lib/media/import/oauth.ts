/**
 * OAuth helpers for Google Drive + Dropbox media import.
 */

import { createHash, randomBytes } from "node:crypto";
import { getAppUrl } from "@/lib/env";
import type { OAuthMediaImportProvider } from "@/lib/media/import/types";

export type OAuthStatePayload = {
  userId: string;
  provider: OAuthMediaImportProvider;
  returnTo: string;
  memoryId: string | null;
  attachToMemory: boolean;
  nonce: string;
};

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signState(payload: OAuthStatePayload): string {
  const secret =
    process.env.MEDIA_OAUTH_STATE_SECRET?.trim() ||
    process.env.PLAID_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.MEDIA_OAUTH_TOKEN_ENCRYPTION_KEY?.trim() ||
    "dev-only-media-oauth-state";
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHash("sha256")
    .update(`${body}.${secret}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function encodeOAuthState(payload: OAuthStatePayload): string {
  return signState(payload);
}

export function decodeOAuthState(state: string): OAuthStatePayload | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const secret =
    process.env.MEDIA_OAUTH_STATE_SECRET?.trim() ||
    process.env.PLAID_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.MEDIA_OAUTH_TOKEN_ENCRYPTION_KEY?.trim() ||
    "dev-only-media-oauth-state";
  const expected = createHash("sha256")
    .update(`${body}.${secret}`)
    .digest("base64url");
  if (expected !== sig) return null;
  try {
    const json = Buffer.from(
      body.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const parsed = JSON.parse(json) as OAuthStatePayload;
    if (!parsed?.userId || !parsed?.provider || !parsed?.nonce) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createOAuthNonce(): string {
  return b64url(randomBytes(16));
}

export function oauthCallbackUrl(provider: OAuthMediaImportProvider): string {
  return `${getAppUrl()}/api/media/import/oauth/${provider}/callback`;
}

export function buildGoogleDriveAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID!.trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthCallbackUrl("google_drive"),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function buildDropboxAuthUrl(state: string): string {
  const appKey = process.env.DROPBOX_APP_KEY!.trim();
  const params = new URLSearchParams({
    client_id: appKey,
    redirect_uri: oauthCallbackUrl("dropbox"),
    response_type: "code",
    token_access_type: "offline",
    state,
  });
  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeGoogleDriveCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  accountLabel: string | null;
  externalAccountId: string | null;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!.trim(),
      redirect_uri: oauthCallbackUrl("google_drive"),
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || "Google token exchange failed");
  }

  let accountLabel: string | null = null;
  let externalAccountId: string | null = null;
  try {
    const about = await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId)",
      { headers: { Authorization: `Bearer ${data.access_token}` } },
    );
    const aboutJson = (await about.json().catch(() => ({}))) as {
      user?: {
        displayName?: string;
        emailAddress?: string;
        permissionId?: string;
      };
    };
    accountLabel =
      aboutJson.user?.emailAddress || aboutJson.user?.displayName || null;
    externalAccountId = aboutJson.user?.permissionId || accountLabel;
  } catch {
    // optional
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
    accountLabel,
    externalAccountId,
  };
}

export async function exchangeDropboxCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  accountLabel: string | null;
  externalAccountId: string | null;
}> {
  const basic = Buffer.from(
    `${process.env.DROPBOX_APP_KEY!.trim()}:${process.env.DROPBOX_APP_SECRET!.trim()}`,
  ).toString("base64");

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: oauthCallbackUrl("dropbox"),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    account_id?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Dropbox token exchange failed",
    );
  }

  let accountLabel: string | null = null;
  try {
    const account = await fetch(
      "https://api.dropboxapi.com/2/users/get_current_account",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          "Content-Type": "application/json",
        },
        body: "null",
      },
    );
    const accountJson = (await account.json().catch(() => ({}))) as {
      email?: string;
      name?: { display_name?: string };
      account_id?: string;
    };
    accountLabel =
      accountJson.email || accountJson.name?.display_name || null;
  } catch {
    // optional
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
    accountLabel,
    externalAccountId: data.account_id ?? accountLabel,
  };
}
