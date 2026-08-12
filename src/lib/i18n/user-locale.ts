/**
 * Resolve a translator for a known user (account preference), else English.
 */

import { getAccountPreferences } from "@/lib/account-preferences";
import {
  createTranslator,
  DEFAULT_LOCALE,
  isAppLocale,
  type AppLocale,
  type TranslateFn,
} from "@/lib/i18n";

export async function resolveUserLocale(
  userId: string | null | undefined,
): Promise<AppLocale> {
  if (!userId) return DEFAULT_LOCALE;
  try {
    const prefs = await getAccountPreferences(userId);
    if (isAppLocale(prefs.locale)) return prefs.locale;
  } catch {
    // fall through
  }
  return DEFAULT_LOCALE;
}

export async function translatorForUserId(
  userId: string | null | undefined,
): Promise<{ locale: AppLocale; t: TranslateFn }> {
  const locale = await resolveUserLocale(userId);
  return { locale, t: createTranslator(locale) };
}
