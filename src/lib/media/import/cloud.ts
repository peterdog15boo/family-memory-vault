/**
 * List + download selected files from connected Drive / Dropbox.
 */

import {
  decryptMediaConnectionTokens,
  getActiveMediaConnection,
  markMediaConnectionError,
  upsertMediaConnection,
} from "@/lib/media/import/connections";
import type { OAuthMediaImportProvider } from "@/lib/media/import/types";
export type RemoteImportFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
};

async function refreshGoogleAccessToken(
  userId: string,
  refreshToken: string,
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!.trim(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || "Google refresh failed");
  }

  const conn = await getActiveMediaConnection(userId, "google_drive");
  if (conn) {
    await upsertMediaConnection({
      userId,
      provider: "google_drive",
      accessToken: data.access_token,
      refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      accountLabel: conn.accountLabel,
      externalAccountId: conn.externalAccountId,
      scopes: conn.scopes,
    });
  }
  return data.access_token;
}

async function getAccessToken(
  userId: string,
  provider: "google_drive" | "dropbox",
): Promise<{ connectionId: string; accessToken: string }> {
  const conn = await getActiveMediaConnection(userId, provider);
  if (!conn) {
    throw new Error("Connect this account before importing.");
  }
  const tokens = await decryptMediaConnectionTokens(conn);
  let accessToken = tokens.accessToken;

  if (
    provider === "google_drive" &&
    conn.expiresAt &&
    conn.expiresAt.getTime() < Date.now() + 60_000 &&
    tokens.refreshToken
  ) {
    accessToken = await refreshGoogleAccessToken(userId, tokens.refreshToken);
  }

  return { connectionId: conn.id, accessToken };
}

export async function listGoogleDriveFiles(
  userId: string,
  options?: { pageToken?: string; query?: string },
): Promise<{ files: RemoteImportFile[]; nextPageToken: string | null }> {
  const { connectionId, accessToken } = await getAccessToken(
    userId,
    "google_drive",
  );
  try {
    const q =
      options?.query?.trim() ||
      "(mimeType contains 'image/' or mimeType contains 'video/') and trashed = false";
    const params = new URLSearchParams({
      pageSize: "40",
      fields: "nextPageToken,files(id,name,mimeType,size)",
      q,
      orderBy: "modifiedTime desc",
    });
    if (options?.pageToken) params.set("pageToken", options.pageToken);

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const data = (await res.json().catch(() => ({}))) as {
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        size?: string;
      }>;
      nextPageToken?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(data.error?.message || "Could not list Drive files");
    }
    return {
      files: (data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? Number(f.size) : null,
      })),
      nextPageToken: data.nextPageToken ?? null,
    };
  } catch (error) {
    await markMediaConnectionError(
      connectionId,
      userId,
      error instanceof Error ? error.message : "Drive list failed",
    );
    throw error;
  }
}

export async function downloadGoogleDriveFile(
  userId: string,
  fileId: string,
): Promise<{ body: Buffer; name: string; mimeType: string }> {
  const { accessToken } = await getAccessToken(userId, "google_drive");

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const meta = (await metaRes.json().catch(() => ({}))) as {
    name?: string;
    mimeType?: string;
    error?: { message?: string };
  };
  if (!metaRes.ok) {
    throw new Error(meta.error?.message || "Drive file not found");
  }

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Drive download failed (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return {
    body: Buffer.from(ab),
    name: meta.name || `drive-${fileId}`,
    mimeType: meta.mimeType || "application/octet-stream",
  };
}

export async function listDropboxFiles(
  userId: string,
  options?: { path?: string; cursor?: string },
): Promise<{ files: RemoteImportFile[]; cursor: string | null }> {
  const { connectionId, accessToken } = await getAccessToken(userId, "dropbox");
  try {
    const endpoint = options?.cursor
      ? "https://api.dropboxapi.com/2/files/list_folder/continue"
      : "https://api.dropboxapi.com/2/files/list_folder";
    const body = options?.cursor
      ? { cursor: options.cursor }
      : {
          path: options?.path ?? "",
          recursive: false,
          include_media_info: false,
          limit: 40,
        };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      entries?: Array<{
        ".tag"?: string;
        id?: string;
        name?: string;
        size?: number;
      }>;
      cursor?: string;
      has_more?: boolean;
      error_summary?: string;
    };
    if (!res.ok) {
      throw new Error(data.error_summary || "Could not list Dropbox files");
    }

    const files: RemoteImportFile[] = (data.entries ?? [])
      .filter((e) => e[".tag"] === "file" && e.id && e.name)
      .filter((e) => /\.(jpe?g|png|webp|heic|heif|mp4|mov|webm)$/i.test(e.name!))
      .map((e) => ({
        id: e.id!,
        name: e.name!,
        mimeType: guessMime(e.name!),
        size: e.size ?? null,
      }));

    return {
      files,
      cursor: data.has_more ? (data.cursor ?? null) : null,
    };
  } catch (error) {
    await markMediaConnectionError(
      connectionId,
      userId,
      error instanceof Error ? error.message : "Dropbox list failed",
    );
    throw error;
  }
}

export async function downloadDropboxFile(
  userId: string,
  fileId: string,
): Promise<{ body: Buffer; name: string; mimeType: string }> {
  const { accessToken } = await getAccessToken(userId, "dropbox");

  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Dropbox-API-Arg": JSON.stringify({ path: fileId }),
    },
  });
  if (!res.ok) {
    throw new Error(`Dropbox download failed (${res.status})`);
  }

  const resultHeader = res.headers.get("dropbox-api-result");
  let name = `dropbox-${fileId}`;
  if (resultHeader) {
    try {
      const parsed = JSON.parse(resultHeader) as { name?: string };
      if (parsed.name) name = parsed.name;
    } catch {
      // ignore
    }
  }

  const ab = await res.arrayBuffer();
  return {
    body: Buffer.from(ab),
    name,
    mimeType: guessMime(name),
  };
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  return "image/jpeg";
}

export async function listRemoteFiles(
  userId: string,
  provider: OAuthMediaImportProvider,
  options?: { pageToken?: string; path?: string },
): Promise<{ files: RemoteImportFile[]; nextPageToken: string | null }> {
  if (provider === "google_drive") {
    const result = await listGoogleDriveFiles(userId, {
      pageToken: options?.pageToken,
    });
    return { files: result.files, nextPageToken: result.nextPageToken };
  }
  if (provider === "dropbox") {
    const result = await listDropboxFiles(userId, {
      path: options?.path,
      cursor: options?.pageToken,
    });
    return { files: result.files, nextPageToken: result.cursor };
  }
  throw new Error("This provider does not support browsing media yet.");
}

export async function downloadRemoteFile(
  userId: string,
  provider: OAuthMediaImportProvider,
  fileId: string,
): Promise<{ body: Buffer; name: string; mimeType: string }> {
  if (provider === "google_drive") {
    return downloadGoogleDriveFile(userId, fileId);
  }
  if (provider === "dropbox") {
    return downloadDropboxFile(userId, fileId);
  }
  throw new Error("This provider does not support downloading media yet.");
}
