"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  LINKED_ACCOUNT_CATEGORIES,
  LINKED_ACCOUNT_CATEGORY_LABELS,
  groupAccountsByCategory,
  type LinkedAccountCategory,
} from "@/lib/plaid/categories";
import type { LinkedAccountView } from "@/lib/plaid/types";
import { cn } from "@/lib/utils";

function formatMoney(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount == null || Number.isNaN(amount)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

function formatSynced(iso: string | null, neverLabel: string): string {
  if (!iso) return neverLabel;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function AccountCard({
  account,
  onChanged,
  showConnectActions = true,
}: {
  account: LinkedAccountView;
  onChanged: () => void;
  /** When false (Legacy view), hide Sync/Disconnect — still allow notes + category. */
  showConnectActions?: boolean;
}) {
  const t = useTranslations();
  const [notes, setNotes] = useState(account.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const balance = formatMoney(account.currentBalance, account.currency);
  const available = formatMoney(account.availableBalance, account.currency);

  async function saveNotes() {
    setSavingNotes(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          notes: notes.trim() ? notes : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t("accounts.notesError"));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("accounts.notesError"));
    } finally {
      setSavingNotes(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: account.plaidItemId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t("accounts.syncError"));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("accounts.syncError"));
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!window.confirm(t("accounts.disconnectConfirm"))) return;
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: account.plaidItemId,
          confirmed: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t("accounts.disconnectError"));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("accounts.disconnectError"));
    } finally {
      setDisconnecting(false);
    }
  }

  async function moveCategory(next: LinkedAccountCategory) {
    if (next === account.category) return;
    setMoving(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts/category", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, category: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || t("accounts.categoryError"));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("accounts.categoryError"));
    } finally {
      setMoving(false);
    }
  }

  return (
    <article className="legacy-vault-panel documents-vault-panel legacy-vault-in space-y-4 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
            {account.institutionName || t("accounts.unknownInstitution")}
          </p>
          <h3 className="truncate text-lg font-semibold text-ink">
            {account.name}
          </h3>
          <p className="text-sm text-ink/60">
            {[account.type, account.subtype].filter(Boolean).join(" · ")}
            {account.mask ? ` · ••••${account.mask}` : ""}
          </p>
        </div>
        <div className="text-right">
          {balance ? (
            <p className="text-lg font-semibold tabular-nums text-ink">
              {balance}
            </p>
          ) : (
            <p className="text-sm text-ink/50">
              {t("accounts.balanceUnavailable")}
            </p>
          )}
          {available ? (
            <p className="text-xs text-ink/50">
              {t("accounts.available")}: {available}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-ink/45">
            {t("accounts.lastSynced")}:{" "}
            {formatSynced(account.lastSyncedAt, t("accounts.neverSynced"))}
          </p>
        </div>
      </div>

      {account.holdings.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-ink">
            {t("accounts.holdings")}
          </h4>
          <ul className="divide-y divide-ink/10 rounded-xl border border-ink/10">
            {account.holdings.slice(0, 8).map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {h.ticker ? (
                    <span className="font-medium">{h.ticker}</span>
                  ) : null}{" "}
                  <span className="text-ink/70">{h.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink/80">
                  {formatMoney(h.value, h.currency) ?? "—"}
                </span>
              </li>
            ))}
          </ul>
          {account.holdings.length > 8 ? (
            <p className="text-xs text-ink/50">
              {t("accounts.moreHoldings", {
                count: account.holdings.length - 8,
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="ui-field">
        <label
          className="ui-label"
          htmlFor={`category-${account.id}`}
        >
          {t("accounts.categoryLabel")}
        </label>
        <select
          id={`category-${account.id}`}
          className="ui-input"
          value={account.category}
          disabled={moving}
          onChange={(e) =>
            void moveCategory(e.target.value as LinkedAccountCategory)
          }
        >
          {LINKED_ACCOUNT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {LINKED_ACCOUNT_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        {account.categoryManual ? (
          <p className="ui-hint mt-1">{t("accounts.categoryManualHint")}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          className="block text-sm font-medium text-ink"
          htmlFor={`notes-${account.id}`}
        >
          {t("accounts.notesLabel")}
        </label>
        <textarea
          id={`notes-${account.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={t("accounts.notesPlaceholder")}
          className="w-full rounded-xl border border-ink/15 bg-canvas/80 px-3 py-2 text-sm text-ink outline-none ring-accent/30 focus:ring-2"
        />
        <button
          type="button"
          disabled={savingNotes}
          onClick={() => void saveNotes()}
          className="text-sm font-medium text-accent-deep hover:underline disabled:opacity-60"
        >
          {savingNotes ? t("accounts.saving") : t("accounts.saveNotes")}
        </button>
      </div>

      {showConnectActions ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={syncing || disconnecting}
            onClick={() => void syncNow()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-60"
          >
            <RefreshCw
              className={cn("size-3.5", syncing && "animate-spin")}
              aria-hidden
            />
            {t("accounts.syncNow")}
          </button>
          <button
            type="button"
            disabled={syncing || disconnecting}
            onClick={() => void disconnect()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {disconnecting
              ? t("accounts.disconnecting")
              : t("accounts.disconnect")}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

type LinkedAccountsSectionsProps = {
  accounts: LinkedAccountView[];
  onChanged: () => void;
  showConnectActions?: boolean;
};

/**
 * Grouped Connected Accounts / Digital Legacy financial list.
 * Empty categories are omitted.
 */
export function LinkedAccountsSections({
  accounts,
  onChanged,
  showConnectActions = true,
}: LinkedAccountsSectionsProps) {
  const t = useTranslations();
  const groups = useMemo(() => groupAccountsByCategory(accounts), [accounts]);

  if (accounts.length === 0) return null;

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.category} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg tracking-tight text-ink">
              {LINKED_ACCOUNT_CATEGORY_LABELS[group.category]}
            </h2>
            <p className="text-xs text-ink/45">
              {t("accounts.categoryCount", { count: group.accounts.length })}
            </p>
          </div>
          <div className="space-y-4">
            {group.accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onChanged={onChanged}
                showConnectActions={showConnectActions}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
