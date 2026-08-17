"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import {
  Building2,
  Landmark,
  Loader2,
  Lock,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type {
  ConnectedAccountsPageData,
  LinkedAccountView,
} from "@/lib/plaid/types";
import { cn } from "@/lib/utils";

type ConnectedAccountsWorkspaceProps = {
  initial: ConnectedAccountsPageData;
};

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

function ConnectButton({
  disabled,
  onLinked,
}: {
  disabled?: boolean;
  onLinked: () => void;
}) {
  const t = useTranslations();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        linkToken?: string;
        error?: string;
      };
      if (!res.ok || !data.linkToken) {
        throw new Error(data.error || t("accounts.linkTokenError"));
      }
      setLinkToken(data.linkToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("accounts.linkTokenError"));
    } finally {
      setBusy(false);
    }
  }, [t]);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || t("accounts.exchangeError"));
        }
        setLinkToken(null);
        onLinked();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("accounts.exchangeError"));
      } finally {
        setBusy(false);
      }
    },
    [onLinked, t],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: (public_token) => {
      if (!public_token) {
        setError(t("accounts.exchangeError"));
        return;
      }
      void onSuccess(public_token);
    },
  });

  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void fetchToken()}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white",
          "transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Landmark className="size-4" aria-hidden />
        )}
        {t("accounts.connectButton")}
      </button>
      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AccountCard({
  account,
  onChanged,
}: {
  account: LinkedAccountView;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const [notes, setNotes] = useState(account.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
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

  return (
    <article className="legacy-vault-panel documents-vault-panel legacy-vault-in space-y-4 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/50">
            {account.institutionName || t("accounts.unknownInstitution")}
          </p>
          <h2 className="truncate text-lg font-semibold text-ink">
            {account.name}
          </h2>
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
            <p className="text-sm text-ink/50">{t("accounts.balanceUnavailable")}</p>
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
          <h3 className="text-sm font-semibold text-ink">
            {t("accounts.holdings")}
          </h3>
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

      <div className="space-y-2">
        <label className="block text-sm font-medium text-ink" htmlFor={`notes-${account.id}`}>
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={syncing || disconnecting}
          onClick={() => void syncNow()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-60"
        >
          <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} aria-hidden />
          {t("accounts.syncNow")}
        </button>
        <button
          type="button"
          disabled={syncing || disconnecting}
          onClick={() => void disconnect()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
        >
          <Trash2 className="size-3.5" aria-hidden />
          {disconnecting ? t("accounts.disconnecting") : t("accounts.disconnect")}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function ConnectedAccountsWorkspace({
  initial,
}: ConnectedAccountsWorkspaceProps) {
  const t = useTranslations();
  const router = useRouter();
  const [data, setData] = useState(initial);

  const refresh = useCallback(() => {
    router.refresh();
    void (async () => {
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) return;
        const next = (await res.json()) as ConnectedAccountsPageData;
        setData(next);
      } catch {
        // keep SSR data
      }
    })();
  }, [router]);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  return (
    <div className="documents-vault legacy-vault app-page mx-auto max-w-4xl space-y-6">
      <AppPageIntro
        slot="documents"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden />
            {t("accounts.eyebrow")}
          </span>
        }
        title={
          <>
            {t("accounts.title")}{" "}
            <HintTooltip
              tip={t("tips.connectedAccounts")}
              label={t("accounts.title")}
            />
          </>
        }
        description={t("accounts.description")}
      />

      {!data.configured ? (
        <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-6">
          <p className="text-sm text-ink/70">{t("accounts.notConfigured")}</p>
        </section>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ConnectButton onLinked={refresh} />
          <p className="text-xs text-ink/45">{t("accounts.privacyNote")}</p>
        </div>
      )}

      {data.configured && data.accounts.length === 0 ? (
        <section className="legacy-vault-panel documents-vault-panel legacy-vault-in space-y-3 rounded-2xl p-8 text-center">
          <Building2 className="mx-auto size-8 text-accent" aria-hidden />
          <h2 className="text-lg font-semibold text-ink">
            {t("accounts.emptyTitle")}
          </h2>
          <p className="mx-auto max-w-md text-sm text-ink/65">
            {t("accounts.emptyBody")}
          </p>
        </section>
      ) : null}

      <div className="space-y-4">
        {data.accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onChanged={refresh}
          />
        ))}
      </div>
    </div>
  );
}
