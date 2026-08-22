"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";

type AcceptFamilyInviteProps = {
  token: string | null;
  /** Optional in-app path after a successful accept (e.g. /upload?request=…). */
  nextPath?: string | null;
};

/**
 * Accept a family invite from /family/accept?token=…
 */
export function AcceptFamilyInvite({
  token,
  nextPath = null,
}: AcceptFamilyInviteProps) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    token ? null : t("family.acceptIncomplete"),
  );
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!token || started) return;
    setStarted(true);
    startTransition(async () => {
      try {
        const response = await fetch("/api/family/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || t("family.acceptFailed"));
        }
        setDone(true);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("family.acceptFailedGeneric"),
        );
      }
    });
  }, [token, started, router, t]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 px-6 py-10 text-center">
        <ShieldAlert className="mx-auto size-8 text-red-700/80" aria-hidden />
        <h1 className="mt-4 font-display text-2xl tracking-tight text-ink">
          {t("family.inviteUnavailable")}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
          {error}
        </p>
        <Link
          href="/family"
          className="ui-btn ui-btn-primary mt-6 inline-flex"
        >
          {t("family.goToFamilySettings")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-accent/25 bg-accent/10 px-6 py-10 text-center">
        <CheckCircle2 className="mx-auto size-8 text-accent-deep" aria-hidden />
        <h1 className="mt-4 font-display text-2xl tracking-tight text-ink">
          {t("family.youreIn")}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
          {t("family.welcomeToFamily")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href={nextPath || "/upload"}
            className="ui-btn ui-btn-primary inline-flex"
          >
            {nextPath?.includes("/upload")
              ? t("family.uploadPhotosCta")
              : t("family.viewFamily")}
          </Link>
          <Link
            href={nextPath ? "/family" : "/dashboard"}
            className="ui-btn ui-btn-secondary inline-flex"
          >
            {nextPath ? t("family.viewFamily") : t("nav.openVault")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="family-panel surface-card rounded-2xl border border-ink/10 bg-canvas/80 px-6 py-10 text-center">
      <Loader2
        className="mx-auto size-8 animate-spin text-accent"
        aria-hidden
      />
      <h1 className="page-title mt-4 font-display text-2xl tracking-tight text-ink">
        {t("family.joiningFamily")}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        {pending
          ? t("family.confirmingInvite")
          : t("family.connectingAccount")}
      </p>
    </div>
  );
}
