/**
 * Owner-scoped Plaid item / linked account persistence + sync.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  linkedAccountHoldings,
  linkedAccounts,
  plaidItems,
  type LinkedAccount,
  type LinkedAccountHolding,
  type PlaidItem,
} from "@/lib/db/schema";
import { getPlaidClient } from "@/lib/plaid/client";
import {
  getPlaidCountryCodes,
  getPlaidProducts,
  isPlaidConfigured,
} from "@/lib/plaid/config";
import type {
  ConnectedAccountsPageData,
  LinkedAccountHoldingView,
  LinkedAccountView,
  PlaidItemView,
} from "@/lib/plaid/types";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { logSensitiveAccess } from "@/lib/security/sensitive-access";
import { logger } from "@/lib/observability/logger";

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function serializeHolding(h: LinkedAccountHolding): LinkedAccountHoldingView {
  return {
    id: h.id,
    name: h.name,
    ticker: h.tickerSymbol,
    quantity: h.quantity,
    value: h.institutionValue,
    price: h.institutionPrice,
    currency: h.isoCurrencyCode,
    asOf: toIso(h.asOf),
  };
}

function serializeAccount(
  account: LinkedAccount,
  item: PlaidItem,
  holdings: LinkedAccountHolding[],
): LinkedAccountView {
  return {
    id: account.id,
    plaidItemId: account.plaidItemId,
    institutionName: item.institutionName,
    name: account.name,
    officialName: account.officialName,
    type: account.type,
    subtype: account.subtype,
    mask: account.mask,
    currentBalance: account.currentBalance,
    availableBalance: account.availableBalance,
    currency: account.isoCurrencyCode,
    notes: account.notes,
    lastSyncedAt: toIso(account.lastSyncedAt),
    holdings: holdings.map(serializeHolding),
  };
}

function serializeItem(
  item: PlaidItem,
  accountCount: number,
): PlaidItemView {
  return {
    id: item.id,
    institutionName: item.institutionName,
    status: item.status,
    lastSyncedAt: toIso(item.lastSyncedAt),
    lastError: item.lastError,
    accountCount,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function createLinkTokenForUser(userId: string): Promise<string> {
  const client = getPlaidClient();
  const response = await client.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "Family Memory Vault",
    products: getPlaidProducts(),
    country_codes: getPlaidCountryCodes(),
    language: "en",
  });
  const token = response.data.link_token;
  if (!token) {
    throw new Error("Plaid did not return a link_token.");
  }
  await logSensitiveAccess({
    userId,
    action: "connected_account.link_token_create",
    targetType: "plaid_item",
    targetId: userId,
    metadata: { products: getPlaidProducts() },
  });
  return token;
}

export async function exchangePublicTokenForUser(
  userId: string,
  publicToken: string,
): Promise<{ itemId: string; accountCount: number }> {
  const client = getPlaidClient();
  const exchange = await client.itemPublicTokenExchange({
    public_token: publicToken,
  });
  const accessToken = exchange.data.access_token;
  const plaidItemId = exchange.data.item_id;
  if (!accessToken || !plaidItemId) {
    throw new Error("Plaid token exchange failed.");
  }

  let institutionId: string | null = null;
  let institutionName: string | null = null;
  try {
    const itemResp = await client.itemGet({ access_token: accessToken });
    institutionId = itemResp.data.item.institution_id ?? null;
    if (institutionId) {
      const inst = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: getPlaidCountryCodes(),
      });
      institutionName = inst.data.institution.name ?? null;
    }
  } catch (error) {
    logger.warn("plaid.exchange.institution", {
      message: "Could not resolve institution metadata",
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  const db = getDb();
  const now = new Date();
  const id = nanoid();
  const encrypted = encryptSecret(accessToken);

  await db.insert(plaidItems).values({
    id,
    userId,
    plaidItemId,
    institutionId,
    institutionName,
    accessTokenEncrypted: encrypted,
    status: "active",
    products: getPlaidProducts(),
    createdAt: now,
    updatedAt: now,
  });

  await logSensitiveAccess({
    userId,
    action: "connected_account.connect",
    targetType: "plaid_item",
    targetId: id,
    metadata: { institutionId, institutionName },
  });

  const synced = await syncPlaidItemForUser(userId, id);
  return { itemId: id, accountCount: synced.accountCount };
}

async function loadOwnedItem(
  userId: string,
  itemId: string,
): Promise<PlaidItem | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, itemId), eq(plaidItems.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function syncPlaidItemForUser(
  userId: string,
  itemId: string,
): Promise<{ accountCount: number; holdingCount: number }> {
  const item = await loadOwnedItem(userId, itemId);
  if (!item) {
    throw new Error("Connected account item not found.");
  }
  if (item.status === "disconnected") {
    throw new Error("This connection has been disconnected.");
  }

  const accessToken = decryptSecret(item.accessTokenEncrypted);
  const client = getPlaidClient();
  const db = getDb();
  const now = new Date();

  try {
    const accountsResp = await client.accountsGet({
      access_token: accessToken,
    });
    const plaidAccounts = accountsResp.data.accounts ?? [];

    const existing = await db
      .select()
      .from(linkedAccounts)
      .where(
        and(
          eq(linkedAccounts.plaidItemId, item.id),
          eq(linkedAccounts.userId, userId),
        ),
      );

    const byPlaidId = new Map(existing.map((a) => [a.plaidAccountId, a]));
    const upserted: LinkedAccount[] = [];

    for (const acct of plaidAccounts) {
      const plaidAccountId = acct.account_id;
      if (!plaidAccountId) continue;
      const prev = byPlaidId.get(plaidAccountId);
      const values = {
        name: acct.name || acct.official_name || "Account",
        officialName: acct.official_name ?? null,
        type: acct.type || "other",
        subtype: acct.subtype ?? null,
        mask: acct.mask ?? null,
        currentBalance: acct.balances?.current ?? null,
        availableBalance: acct.balances?.available ?? null,
        isoCurrencyCode:
          acct.balances?.iso_currency_code ??
          acct.balances?.unofficial_currency_code ??
          null,
        lastSyncedAt: now,
        updatedAt: now,
        metadata: {
          verificationStatus: acct.verification_status ?? null,
          persistentAccountId: acct.persistent_account_id ?? null,
        },
      };

      if (prev) {
        const [updated] = await db
          .update(linkedAccounts)
          .set(values)
          .where(eq(linkedAccounts.id, prev.id))
          .returning();
        if (updated) upserted.push(updated);
      } else {
        const [created] = await db
          .insert(linkedAccounts)
          .values({
            id: nanoid(),
            userId,
            plaidItemId: item.id,
            plaidAccountId,
            notes: null,
            createdAt: now,
            ...values,
          })
          .returning();
        if (created) upserted.push(created);
      }
    }

    // Remove accounts Plaid no longer returns for this item
    const keepIds = new Set(upserted.map((a) => a.plaidAccountId));
    const removed = existing.filter((a) => !keepIds.has(a.plaidAccountId));
    if (removed.length > 0) {
      const removedIds = removed.map((a) => a.id);
      await db
        .delete(linkedAccountHoldings)
        .where(inArray(linkedAccountHoldings.linkedAccountId, removedIds));
      await db
        .delete(linkedAccounts)
        .where(inArray(linkedAccounts.id, removedIds));
    }

    let holdingCount = 0;
    const investmentAccounts = upserted.filter(
      (a) => a.type === "investment" || a.subtype === "brokerage",
    );

    if (investmentAccounts.length > 0) {
      try {
        const holdingsResp = await client.investmentsHoldingsGet({
          access_token: accessToken,
        });
        const securities = new Map(
          (holdingsResp.data.securities ?? []).map((s) => [s.security_id, s]),
        );
        const holdings = holdingsResp.data.holdings ?? [];

        const accountByPlaidId = new Map(
          upserted.map((a) => [a.plaidAccountId, a]),
        );

        // Replace holdings snapshot for investment accounts on this item
        const invIds = investmentAccounts.map((a) => a.id);
        if (invIds.length > 0) {
          await db
            .delete(linkedAccountHoldings)
            .where(inArray(linkedAccountHoldings.linkedAccountId, invIds));
        }

        for (const h of holdings) {
          const local = accountByPlaidId.get(h.account_id);
          if (!local) continue;
          const sec = securities.get(h.security_id);
          await db.insert(linkedAccountHoldings).values({
            id: nanoid(),
            userId,
            linkedAccountId: local.id,
            plaidSecurityId: h.security_id ?? null,
            name: sec?.name || sec?.ticker_symbol || "Holding",
            tickerSymbol: sec?.ticker_symbol ?? null,
            quantity: h.quantity ?? null,
            institutionValue: h.institution_value ?? null,
            institutionPrice: h.institution_price ?? null,
            isoCurrencyCode:
              h.iso_currency_code ?? h.unofficial_currency_code ?? null,
            asOf: now,
            metadata: {
              costBasis: h.cost_basis ?? null,
              securityType: sec?.type ?? null,
            },
            createdAt: now,
            updatedAt: now,
          });
          holdingCount += 1;
        }
      } catch (error) {
        // Investments product may be unavailable for bank-only items.
        logger.info("plaid.sync.holdings_skipped", {
          itemId: item.id,
          message: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    await db
      .update(plaidItems)
      .set({
        status: "active",
        lastSyncedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(plaidItems.id, item.id));

    await logSensitiveAccess({
      userId,
      action: "connected_account.sync",
      targetType: "plaid_item",
      targetId: item.id,
      metadata: {
        accountCount: upserted.length,
        holdingCount,
      },
    });

    return { accountCount: upserted.length, holdingCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    await db
      .update(plaidItems)
      .set({
        status: "error",
        lastError: message.slice(0, 500),
        updatedAt: now,
      })
      .where(eq(plaidItems.id, item.id));
    throw error;
  }
}

export async function disconnectPlaidItemForUser(
  userId: string,
  itemId: string,
): Promise<void> {
  const item = await loadOwnedItem(userId, itemId);
  if (!item) {
    throw new Error("Connected account item not found.");
  }

  try {
    const accessToken = decryptSecret(item.accessTokenEncrypted);
    const client = getPlaidClient();
    await client.itemRemove({ access_token: accessToken });
  } catch (error) {
    logger.warn("plaid.disconnect.remote", {
      itemId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  const db = getDb();
  const accounts = await db
    .select({ id: linkedAccounts.id })
    .from(linkedAccounts)
    .where(
      and(
        eq(linkedAccounts.plaidItemId, item.id),
        eq(linkedAccounts.userId, userId),
      ),
    );
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length > 0) {
    await db
      .delete(linkedAccountHoldings)
      .where(inArray(linkedAccountHoldings.linkedAccountId, accountIds));
    await db
      .delete(linkedAccounts)
      .where(inArray(linkedAccounts.id, accountIds));
  }
  await db.delete(plaidItems).where(eq(plaidItems.id, item.id));

  await logSensitiveAccess({
    userId,
    action: "connected_account.disconnect",
    targetType: "plaid_item",
    targetId: item.id,
    metadata: { deletedAccounts: accountIds.length },
  });
}

export async function updateLinkedAccountNotes(
  userId: string,
  accountId: string,
  notes: string | null,
): Promise<LinkedAccountView | null> {
  const db = getDb();
  const [account] = await db
    .select()
    .from(linkedAccounts)
    .where(
      and(eq(linkedAccounts.id, accountId), eq(linkedAccounts.userId, userId)),
    )
    .limit(1);
  if (!account) return null;

  const [updated] = await db
    .update(linkedAccounts)
    .set({
      notes: notes?.trim() ? notes.trim().slice(0, 4000) : null,
      updatedAt: new Date(),
    })
    .where(eq(linkedAccounts.id, accountId))
    .returning();

  if (!updated) return null;

  const [item] = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, updated.plaidItemId))
    .limit(1);
  if (!item) return null;

  const holdings = await db
    .select()
    .from(linkedAccountHoldings)
    .where(eq(linkedAccountHoldings.linkedAccountId, updated.id));

  await logSensitiveAccess({
    userId,
    action: "connected_account.notes_update",
    targetType: "linked_account",
    targetId: accountId,
    metadata: { hasNotes: Boolean(updated.notes) },
  });

  return serializeAccount(updated, item, holdings);
}

export async function listConnectedAccountsForUser(
  userId: string,
): Promise<ConnectedAccountsPageData> {
  const configured = isPlaidConfigured();
  const db = getDb();

  const items = await db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId))
    .orderBy(desc(plaidItems.createdAt));

  const accounts = await db
    .select()
    .from(linkedAccounts)
    .where(eq(linkedAccounts.userId, userId))
    .orderBy(desc(linkedAccounts.updatedAt));

  const accountIds = accounts.map((a) => a.id);
  const holdings =
    accountIds.length > 0
      ? await db
          .select()
          .from(linkedAccountHoldings)
          .where(inArray(linkedAccountHoldings.linkedAccountId, accountIds))
      : [];

  const holdingsByAccount = new Map<string, LinkedAccountHolding[]>();
  for (const h of holdings) {
    const list = holdingsByAccount.get(h.linkedAccountId) ?? [];
    list.push(h);
    holdingsByAccount.set(h.linkedAccountId, list);
  }

  const itemsById = new Map(items.map((i) => [i.id, i]));
  const counts = new Map<string, number>();
  for (const a of accounts) {
    counts.set(a.plaidItemId, (counts.get(a.plaidItemId) ?? 0) + 1);
  }

  return {
    configured,
    items: items.map((i) => serializeItem(i, counts.get(i.id) ?? 0)),
    accounts: accounts
      .map((a) => {
        const item = itemsById.get(a.plaidItemId);
        if (!item) return null;
        return serializeAccount(a, item, holdingsByAccount.get(a.id) ?? []);
      })
      .filter((a): a is LinkedAccountView => Boolean(a)),
  };
}
