"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TermsOfServiceDocument } from "@/components/legal/TermsOfServiceDocument";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { TERMS_VERSION } from "@/lib/terms/constants";
import { cn } from "@/lib/utils";

type Props = {
  displayName: string;
  email: string;
  redirectTo: string;
};

/**
 * Clickwrap gate for Terms of Service acceptance.
 * Identity comes from the signed-in account (shown read-only).
 */
export function TermsAgreeForm({ displayName, email, redirectTo }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit = useMemo(
    () => agreed && !pending,
    [agreed, pending],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/terms/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agreed: true,
            redirectTo,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          redirectTo?: string;
        };
        if (!res.ok) {
          setError(data.error || t("terms.errorSave"));
          return;
        }
        router.replace(data.redirectTo || redirectTo || "/dashboard");
        router.refresh();
      } catch {
        setError(t("terms.errorNetwork"));
      }
    });
  }

  return (
    <div className="beta-nda-page terms-agree-page">
      <header className="beta-nda-header">
        <p className="beta-nda-eyebrow">{t("terms.eyebrow")}</p>
        <h1 className="beta-nda-title">{t("terms.title")}</h1>
        <p className="beta-nda-lead">{t("terms.lead")}</p>
        <p className="beta-nda-version">
          {t("terms.documentVersion", { version: TERMS_VERSION })}
        </p>
        {(displayName || email) && (
          <p className="terms-agree-identity text-sm text-ink-muted">
            {displayName ? (
              <span className="font-medium text-ink">{displayName}</span>
            ) : null}
            {displayName && email ? " · " : null}
            {email ? <span>{email}</span> : null}
          </p>
        )}
      </header>

      <TermsOfServiceDocument
        articleClassName="beta-nda-scroll"
        ariaLabel={t("terms.docAria")}
        showClosing
      />

      <form className="beta-nda-form" onSubmit={onSubmit} noValidate>
        <label
          className={cn("beta-nda-check", !agreed && error ? "is-error" : null)}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={pending}
          />
          <span>{t("terms.agreeCheckbox")}</span>
        </label>

        {error ? (
          <p className="beta-nda-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="ui-btn ui-btn-primary beta-nda-submit"
          disabled={!canSubmit}
        >
          {pending ? t("common.saving") : t("terms.submit")}
        </button>
      </form>
    </div>
  );
}
