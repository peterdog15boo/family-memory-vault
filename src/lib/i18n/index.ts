/**
 * Client-safe i18n surface.
 *
 * Server: import `getLocale` / `getTranslations` from `@/lib/i18n/server`.
 * Client: `<LocaleProvider>` + `useTranslations()` / `useLocale()`.
 *
 * Keys are dotted paths into the message tree, e.g. `nav.settings`.
 */

import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  DEFAULT_LOCALE,
  type AppLocale,
} from "@/lib/i18n/locales";
import { translate } from "@/lib/i18n/t";
import type {
  MessageTree,
  TranslateFn,
  TranslationValues,
} from "@/lib/i18n/types";

export {
  APP_LOCALES,
  APP_LOCALE_LABELS,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isAppLocale,
  negotiateLocale,
  persistLocalePreference,
  readStoredLocale,
  applyLocaleToDocument,
  resolveLocale,
  type AppLocale,
} from "@/lib/i18n/locales";
export { translate, hasMessage } from "@/lib/i18n/t";
export type {
  MessageTree,
  TranslateFn,
  TranslationValues,
} from "@/lib/i18n/types";
export { getDictionary } from "@/lib/i18n/dictionaries";
export { copyFromT } from "@/lib/i18n/copy";
export {
  createFormatters,
  formatCents,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatLocale,
  formatNumber,
  formatPercent,
  formatTime,
  type DateInput,
  type Formatters,
} from "@/lib/i18n/format";

export function createTranslator(
  locale: AppLocale,
  dictionary: MessageTree = getDictionary(locale),
): TranslateFn {
  const fallback = getDictionary(DEFAULT_LOCALE);
  return (key, values) => translate(dictionary, key, values, fallback);
}
