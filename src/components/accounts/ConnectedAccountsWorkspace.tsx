"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { Building2, Landmark, Loader2, Lock } from "lucide-react";
import { LinkedAccountsSections } from "@/components/accounts/LinkedAccountsSections";
import { AppPageIntro } from "@/components/ui/AppPageIntro";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { ConnectedAccountsPageData } from "@/lib/plaid/types";
import { cn } from "@/lib/utils";

type ConnectedAccountsWorkspaceProps = {
  initial: ConnectedAccountsPageData;
};

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
        <div className="space-y-3">
          {data.env === "sandbox" ? (
            <div
              className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-ink"
              role="note"
            >
              <p className="font-semibold text-amber-950 dark:text-amber-100">
                {t("accounts.sandboxTipTitle")}
              </p>
              <p className="mt-1 text-ink/75">{t("accounts.sandboxTipBody")}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ConnectButton onLinked={refresh} />
            <p className="text-xs text-ink/45">{t("accounts.privacyNote")}</p>
          </div>
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

      <LinkedAccountsSections
        accounts={data.accounts}
        onChanged={refresh}
        showConnectActions
      />
    </div>
  );
}
