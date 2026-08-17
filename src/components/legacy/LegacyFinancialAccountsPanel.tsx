"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Landmark } from "lucide-react";
import { LinkedAccountsSections } from "@/components/accounts/LinkedAccountsSections";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { ConnectedAccountsPageData } from "@/lib/plaid/types";

type LegacyFinancialAccountsPanelProps = {
  initial: ConnectedAccountsPageData;
};

/**
 * Digital Legacy — Financial Accounts section.
 * Same categorization as /accounts; connect/disconnect lives on Connected Accounts.
 */
export function LegacyFinancialAccountsPanel({
  initial,
}: LegacyFinancialAccountsPanelProps) {
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
        // keep SSR
      }
    })();
  }, [router]);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h2 className="font-display text-xl tracking-tight text-ink">
          {t("legacy.financialAccountsTitle")}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">
          {t("legacy.financialAccountsLead")}
        </p>
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-deep hover:underline"
        >
          <Landmark className="size-3.5" aria-hidden />
          {t("legacy.financialAccountsManage")}
        </Link>
      </header>

      {!data.configured ? (
        <section className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-6">
          <p className="text-sm text-ink/70">{t("accounts.notConfigured")}</p>
        </section>
      ) : null}

      {data.configured && data.accounts.length === 0 ? (
        <section className="legacy-vault-panel documents-vault-panel legacy-vault-in space-y-3 rounded-2xl p-8 text-center">
          <Building2 className="mx-auto size-8 text-accent" aria-hidden />
          <h3 className="text-lg font-semibold text-ink">
            {t("legacy.financialAccountsEmptyTitle")}
          </h3>
          <p className="mx-auto max-w-md text-sm text-ink/65">
            {t("legacy.financialAccountsEmptyBody")}
          </p>
          <Link
            href="/accounts"
            className="ui-btn ui-btn-primary ui-btn-sm inline-flex items-center gap-1.5"
          >
            <Landmark className="size-3.5" aria-hidden />
            {t("accounts.connectButton")}
          </Link>
        </section>
      ) : null}

      <LinkedAccountsSections
        accounts={data.accounts}
        onChanged={refresh}
        showConnectActions={false}
      />
    </div>
  );
}
