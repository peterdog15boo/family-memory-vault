/**
 * Server-only locale resolution for App Router.
 * Do not import from client components.
 */

import { cookies, headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { getAccountPreferences } from "@/lib/account-preferences";
import {
  createFormatters,
  createTranslator,
  getDictionary,
  type AppLocale,
  type Formatters,
  type MessageTree,
  type TranslateFn,
} from "@/lib/i18n";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isAppLocale,
  negotiateLocale,
} from "@/lib/i18n/locales";

function cookieLocale(cookieStore: {
  get: (name: string) => { value?: string } | undefined;
}): AppLocale | null {
  const raw = cookieStore.get(LOCALE_STORAGE_KEY)?.value;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return isAppLocale(decoded) ? decoded : null;
  } catch {
    return isAppLocale(raw) ? raw : null;
  }
}

/**
 * Resolve the active locale for the current request.
 * Signed-in users: account preference. Guests: cookie, then Accept-Language.
 */
export async function getLocale(): Promise<AppLocale> {
  try {
    const { userId, isAuthenticated } = await auth();
    if (isAuthenticated && userId) {
      const prefs = await getAccountPreferences(userId);
      if (isAppLocale(prefs.locale)) return prefs.locale;
    }
  } catch {
    // Clerk/DB unavailable — fall through to cookie / Accept-Language.
  }

  try {
    const store = await cookies();
    const fromCookie = cookieLocale(store);
    if (fromCookie) return fromCookie;
  } catch {
    // ignore
  }

  try {
    const hdrs = await headers();
    return negotiateLocale(hdrs.get("accept-language"));
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Server helper: `const t = await getTranslations()` then `t("nav.settings")`. */
export async function getTranslations(): Promise<TranslateFn> {
  const locale = await getLocale();
  return createTranslator(locale);
}

/** Server helper: Intl formatters for the active request locale. */
export async function getFormatters(): Promise<Formatters> {
  const locale = await getLocale();
  return createFormatters(locale);
}

export async function getLocaleAndTranslations(): Promise<{
  locale: AppLocale;
  t: TranslateFn;
  format: Formatters;
  dictionary: MessageTree;
}> {
  const locale = await getLocale();
  const dictionary = getDictionary(locale);
  return {
    locale,
    dictionary,
    t: createTranslator(locale, dictionary),
    format: createFormatters(locale),
  };
}
