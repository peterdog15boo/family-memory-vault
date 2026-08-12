"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/nextjs";
import {
  applyLocaleToDocument,
  createFormatters,
  createTranslator,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  persistLocalePreference,
  readStoredLocale,
  resolveLocale,
  type AppLocale,
  type Formatters,
  type TranslateFn,
} from "@/lib/i18n";
import { copyFromT } from "@/lib/i18n/copy";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => Promise<void>;
  t: TranslateFn;
  format: Formatters;
  copy: ReturnType<typeof copyFromT>;
  ready: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

type LocaleProviderProps = {
  initialLocale?: AppLocale;
  children: ReactNode;
};

export function LocaleProvider({
  initialLocale,
  children,
}: LocaleProviderProps) {
  const { isSignedIn, isLoaded } = useUser();
  const [locale, setLocaleState] = useState<AppLocale>(
    () => initialLocale ?? DEFAULT_LOCALE,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    const stored = readStoredLocale();
    const next = isSignedIn
      ? (initialLocale ?? stored ?? DEFAULT_LOCALE)
      : (stored ?? initialLocale ?? DEFAULT_LOCALE);
    setLocaleState(next);
    applyLocaleToDocument(next);
    persistLocalePreference(next);
    setReady(true);

    function onStorage(event: StorageEvent) {
      if (event.key !== LOCALE_STORAGE_KEY) return;
      const resolved = resolveLocale(event.newValue);
      setLocaleState(resolved);
      applyLocaleToDocument(resolved);
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [initialLocale, isLoaded, isSignedIn]);

  const setLocale = useCallback(
    async (next: AppLocale) => {
      // Apply immediately so chrome updates without waiting on the network.
      setLocaleState(next);
      applyLocaleToDocument(next);
      persistLocalePreference(next);

      if (isLoaded && isSignedIn) {
        const res = await fetch("/api/settings/account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: next }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || "Could not save language.");
        }
      }
    },
    [isLoaded, isSignedIn],
  );

  const t = useMemo(() => createTranslator(locale), [locale]);
  const format = useMemo(() => createFormatters(locale), [locale]);
  const copy = useMemo(() => copyFromT(t), [t]);

  const value = useMemo(
    () => ({ locale, setLocale, t, format, copy, ready }),
    [locale, setLocale, t, format, copy, ready],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

export function useTranslations(): TranslateFn {
  return useLocale().t;
}

export function useFormat(): Formatters {
  return useLocale().format;
}

export function useCopy() {
  return useLocale().copy;
}
