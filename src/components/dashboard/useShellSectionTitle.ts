"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { APP_HOME_PATH } from "@/lib/routes";

/**
 * Short section label for compact shell chrome (phone / landscape).
 * Empty on home so the logo stays the only brand signal.
 */
export function useShellSectionTitle(): string | null {
  const pathname = usePathname() || "/";
  const t = useTranslations();
  const path = pathname.split("?")[0] || "/";

  if (path === APP_HOME_PATH || path === "/dashboard") return null;
  if (path === "/memories" || path.startsWith("/memories/")) {
    return t("nav.memories");
  }
  if (path === "/movies" || path.startsWith("/movies/")) {
    return t("nav.movies");
  }
  if (path === "/media" || path.startsWith("/media/")) {
    return t("nav.photos");
  }
  if (path === "/on-this-day" || path.startsWith("/on-this-day/")) {
    return t("nav.onThisDay");
  }
  if (path === "/upload" || path.startsWith("/upload/")) {
    return t("nav.upload");
  }
  if (path === "/people" || path.startsWith("/people/")) {
    return t("nav.people");
  }
  if (path === "/family-tree" || path.startsWith("/family-tree/")) {
    return t("nav.familyTree");
  }
  if (path === "/family" || path.startsWith("/family/")) {
    return t("nav.family");
  }
  if (path === "/documents" || path.startsWith("/documents/")) {
    return t("nav.documents");
  }
  if (path === "/legacy" || path.startsWith("/legacy/")) {
    return t("nav.legacy");
  }
  if (path === "/accounts" || path.startsWith("/accounts/")) {
    return t("nav.accounts");
  }
  if (
    path === "/family-memory-box" ||
    path.startsWith("/family-memory-box/") ||
    path.startsWith("/digitize")
  ) {
    return t("nav.digitize");
  }
  if (path === "/billing" || path.startsWith("/billing/")) {
    return t("nav.billing");
  }
  if (path === "/settings" || path.startsWith("/settings/")) {
    return t("nav.settings");
  }
  if (path === "/notifications" || path.startsWith("/notifications/")) {
    return t("notifications.ui.title");
  }
  if (path === "/assistant" || path.startsWith("/assistant/")) {
    return t("nav.askAi");
  }
  if (path === "/admin" || path.startsWith("/admin/")) {
    return t("nav.admin");
  }
  return null;
}
