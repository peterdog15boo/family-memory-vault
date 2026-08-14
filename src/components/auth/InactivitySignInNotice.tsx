"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { consumeInactivityLogoutFlag } from "@/lib/session/idle-session-sync";

/**
 * One-shot banner on sign-in after idle logout.
 */
export function InactivitySignInNotice() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get("reason") === "inactivity";
    const fromStorage = consumeInactivityLogoutFlag();
    if (fromQuery || fromStorage) {
      setShow(true);
    }
  }, [searchParams]);

  if (!show) return null;

  return (
    <p
      role="status"
      className="mb-4 rounded-lg border border-ink/10 bg-canvas/90 px-3 py-2 text-sm text-ink shadow-sm backdrop-blur-sm"
    >
      {t("session.signedOutInactivity")}
    </p>
  );
}
