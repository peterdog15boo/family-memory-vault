"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { TranslateFn } from "@/lib/i18n";
import { announce } from "@/lib/a11y/announce";

/**
 * Announce main content / route changes for screen readers.
 * Skips the first mount so refresh doesn't read the landing page twice.
 */
export function RouteAnnouncer() {
  const pathname = usePathname();
  const t = useTranslations();
  const ready = useRef(false);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (!ready.current) {
      ready.current = true;
      lastPath.current = pathname;
      return;
    }
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;

    const label = pathLabel(pathname, t);
    announce(t("a11y.pageChanged", { page: label }), { priority: "polite" });
  }, [pathname, t]);

  return null;
}

function pathLabel(pathname: string, t: TranslateFn): string {
  const path = pathname.replace(/\/$/, "") || "/";
  const map: Record<string, string> = {
    "/": t("a11y.pages.home"),
    "/dashboard": t("a11y.pages.dashboard"),
    "/photos": t("a11y.pages.photos"),
    "/upload": t("a11y.pages.upload"),
    "/memories": t("a11y.pages.memories"),
    "/people": t("a11y.pages.people"),
    "/family": t("a11y.pages.family"),
    "/documents": t("a11y.pages.documents"),
    "/legacy": t("a11y.pages.legacy"),
    "/accounts": t("a11y.pages.accounts"),
    "/settings": t("a11y.pages.settings"),
    "/notifications": t("a11y.pages.notifications"),
    "/assistant": t("a11y.pages.assistant"),
    "/admin": t("a11y.pages.admin"),
  };

  if (map[path]) return map[path];

  if (path.startsWith("/memories/")) return t("a11y.pages.memoryDetail");
  if (path.startsWith("/people/")) return t("a11y.pages.personDetail");
  if (path.startsWith("/documents/")) return t("a11y.pages.documentDetail");
  if (path.startsWith("/legacy/")) return t("a11y.pages.legacy");
  if (path.startsWith("/accounts")) return t("a11y.pages.accounts");
  if (path.startsWith("/admin/")) return t("a11y.pages.admin");
  if (path.startsWith("/settings")) return t("a11y.pages.settings");

  return t("a11y.pages.generic");
}
