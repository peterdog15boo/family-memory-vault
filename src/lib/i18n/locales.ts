/**
 * Supported UI locales for Family Memory Vault.
 * Default is US English. Codes follow BCP 47.
 */

export const APP_LOCALES = [
  "en-US",
  "es",
  "fr",
  "de",
  "pt-BR",
  "zh-CN",
  "ja",
  "ko",
  "it",
  "nl",
] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en-US";

/** Cookie + localStorage key for guest / pre-auth preference. */
export const LOCALE_STORAGE_KEY = "fmv-locale";

/** Native-script labels for the language picker (not translated). */
export const APP_LOCALE_LABELS: Record<AppLocale, string> = {
  "en-US": "English (US)",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  "pt-BR": "Português (Brasil)",
  "zh-CN": "简体中文",
  ja: "日本語",
  ko: "한국어",
  it: "Italiano",
  nl: "Nederlands",
};

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === "string" &&
    (APP_LOCALES as readonly string[]).includes(value)
  );
}

/** Map Accept-Language / browser tags onto a supported locale. */
export function negotiateLocale(raw: string | null | undefined): AppLocale {
  if (!raw?.trim()) return DEFAULT_LOCALE;
  const candidates = raw
    .split(",")
    .map((part) => part.split(";")[0]?.trim())
    .filter(Boolean) as string[];

  for (const tag of candidates) {
    if (isAppLocale(tag)) return tag;
    const lower = tag.toLowerCase();
    if (lower.startsWith("en")) return "en-US";
    if (lower.startsWith("es")) return "es";
    if (lower.startsWith("fr")) return "fr";
    if (lower.startsWith("de")) return "de";
    if (lower === "pt-br" || lower.startsWith("pt-br")) return "pt-BR";
    if (lower.startsWith("pt")) return "pt-BR";
    if (lower.startsWith("zh")) return "zh-CN";
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("ko")) return "ko";
    if (lower.startsWith("it")) return "it";
    if (lower.startsWith("nl")) return "nl";
  }
  return DEFAULT_LOCALE;
}

export function resolveLocale(value: unknown): AppLocale {
  if (isAppLocale(value)) return value;
  if (typeof value === "string") return negotiateLocale(value);
  return DEFAULT_LOCALE;
}

export function persistLocalePreference(locale: AppLocale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // private mode / blocked storage
  }
  try {
    document.cookie = `${LOCALE_STORAGE_KEY}=${encodeURIComponent(locale)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export function readStoredLocale(): AppLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isAppLocale(raw)) return raw;
  } catch {
    // ignore
  }
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${LOCALE_STORAGE_KEY}=([^;]+)`),
    );
    const raw = match?.[1] ? decodeURIComponent(match[1]) : null;
    if (isAppLocale(raw)) return raw;
  } catch {
    // ignore
  }
  return null;
}

export function applyLocaleToDocument(locale: AppLocale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.setAttribute("data-locale", locale);
}
