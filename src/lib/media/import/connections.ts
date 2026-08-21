/**
 * Owner-only OAuth connections for cloud media import.
 * Tokens encrypted at rest; never returned to clients.
 */

import { and, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  mediaConnections,
  type MediaConnection,
  type MediaConnectionStatus,
} from "@/lib/db/schema";
import type {
  MediaConnectionPublic,
  OAuthMediaImportProvider,
} from "@/lib/media/import/types";
import {
  decryptSecret,
  encryptSecret,
  getMediaOAuthTokenEncryptionKey,
} from "@/lib/security/crypto";

export function toPublicMediaConnection(
  row: MediaConnection,
): MediaConnectionPublic {
  return {
    id: row.id,
    provider: row.provider as OAuthMediaImportProvider,
    accountLabel: row.accountLabel,
    externalAccountId: row.externalAccountId,
    status: row.status,
    connectedAt: row.createdAt.toISOString(),
    lastError: row.lastError,
  };
}

export async function listMediaConnectionsForUser(
  userId: string,
): Promise<MediaConnectionPublic[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(mediaConnections)
    .where(
      and(
        eq(mediaConnections.userId, userId),
        ne(mediaConnections.status, "disconnected"),
      ),
    );
  return rows.map(toPublicMediaConnection);
}

export async function getActiveMediaConnection(
  userId: string,
  provider: OAuthMediaImportProvider,
): Promise<MediaConnection | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(mediaConnections)
    .where(
      and(
        eq(mediaConnections.userId, userId),
        eq(mediaConnections.provider, provider),
        eq(mediaConnections.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertMediaConnection(input: {
  userId: string;
  provider: OAuthMediaImportProvider;
  accountLabel?: string | null;
  externalAccountId?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  scopes?: string[];
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}): Promise<MediaConnection> {
  const db = getDb();
  const key = getMediaOAuthTokenEncryptionKey();
  const now = new Date();
  const accessTokenEncrypted = encryptSecret(input.accessToken, key);
  const refreshTokenEncrypted = input.refreshToken
    ? encryptSecret(input.refreshToken, key)
    : null;

  const existing = await getActiveMediaConnection(input.userId, input.provider);
  if (existing) {
    const [updated] = await db
      .update(mediaConnections)
      .set({
        accountLabel: input.accountLabel ?? existing.accountLabel,
        externalAccountId:
          input.externalAccountId ?? existing.externalAccountId,
        accessTokenEncrypted,
        refreshTokenEncrypted:
          refreshTokenEncrypted ?? existing.refreshTokenEncrypted,
        scopes: input.scopes ?? existing.scopes,
        status: "active",
        expiresAt: input.expiresAt ?? existing.expiresAt,
        lastError: null,
        metadata: {
          ...(existing.metadata ?? {}),
          ...(input.metadata ?? {}),
        },
        updatedAt: now,
      })
      .where(eq(mediaConnections.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(mediaConnections)
    .values({
      id: nanoid(),
      userId: input.userId,
      provider: input.provider,
      accountLabel: input.accountLabel ?? null,
      externalAccountId: input.externalAccountId ?? null,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      scopes: input.scopes ?? [],
      status: "active",
      expiresAt: input.expiresAt ?? null,
      lastError: null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return created!;
}

export async function decryptMediaConnectionTokens(
  row: MediaConnection,
): Promise<{ accessToken: string; refreshToken: string | null }> {
  const key = getMediaOAuthTokenEncryptionKey();
  return {
    accessToken: decryptSecret(row.accessTokenEncrypted, key),
    refreshToken: row.refreshTokenEncrypted
      ? decryptSecret(row.refreshTokenEncrypted, key)
      : null,
  };
}

export async function markMediaConnectionError(
  connectionId: string,
  userId: string,
  message: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(mediaConnections)
    .set({
      status: "error" as MediaConnectionStatus,
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaConnections.id, connectionId),
        eq(mediaConnections.userId, userId),
      ),
    );
}

export async function disconnectMediaConnection(
  connectionId: string,
  userId: string,
): Promise<boolean> {
  const db = getDb();
  const [updated] = await db
    .update(mediaConnections)
    .set({
      status: "disconnected",
      accessTokenEncrypted: encryptSecret(
        `disconnected:${nanoid()}`,
        getMediaOAuthTokenEncryptionKey(),
      ),
      refreshTokenEncrypted: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaConnections.id, connectionId),
        eq(mediaConnections.userId, userId),
      ),
    )
    .returning({ id: mediaConnections.id });
  return Boolean(updated);
}
