"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ThemeContext,
  type ThemeContextValue,
} from "@/components/theme/theme-context";
import {
  APP_THEME_DEFAULT,
  APP_THEME_STORAGE_KEY,
  applyThemeToDocument,
  isAppTheme,
  persistThemePreference,
  readDomTheme,
  readStoredTheme,
  type AppTheme,
} from "@/lib/theme/types";

function persistTheme(theme: AppTheme) {
  persistThemePreference(theme);
}

function fallbackThemeValue(theme: AppTheme): ThemeContextValue {
  return {
    theme,
    setTheme: () => {},
    restoreOriginal: () => {},
    applyModernDefault: () => {},
    toggleTheme: () => {},
    ready: false,
    isModern: theme === "modern",
  };
}

/**
 * Provides reversible app themes (original | modern).
 * Persists to localStorage and syncs `data-theme` on <html> immediately.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Prefer boot-script DOM theme to avoid a flash of Original on hydrate.
  const [theme, setThemeState] = useState<AppTheme>(() => {
    return readDomTheme() ?? APP_THEME_DEFAULT;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Optional ?theme=modern|original deep-links (also persist).
    let fromQuery: AppTheme | null = null;
    try {
      const raw = new URLSearchParams(window.location.search).get("theme");
      if (isAppTheme(raw)) fromQuery = raw;
    } catch {
      // ignore
    }

    const initial = fromQuery ?? readStoredTheme();
    setThemeState(initial);
    applyThemeToDocument(initial);
    if (fromQuery) persistTheme(fromQuery);
    setReady(true);

    function onStorage(event: StorageEvent) {
      if (event.key !== APP_THEME_STORAGE_KEY) return;
      const next = isAppTheme(event.newValue)
        ? event.newValue
        : APP_THEME_DEFAULT;
      setThemeState(next);
      applyThemeToDocument(next);
    }

    function syncAtmospherePaused() {
      document.documentElement.toggleAttribute(
        "data-atmosphere-paused",
        document.hidden,
      );
    }

    syncAtmospherePaused();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", syncAtmospherePaused);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", syncAtmospherePaused);
    };
  }, []);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
    applyThemeToDocument(next);
    persistTheme(next);
  }, []);

  const restoreOriginal = useCallback(() => {
    setTheme("original");
  }, [setTheme]);

  /** Return to the site default (Modern). */
  const applyModernDefault = useCallback(() => {
    setTheme("modern");
  }, [setTheme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "modern" ? "original" : "modern");
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      restoreOriginal,
      applyModernDefault,
      toggleTheme,
      ready,
      isModern: theme === "modern",
    }),
    [theme, setTheme, restoreOriginal, applyModernDefault, toggleTheme, ready],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Theme hook. Falls back to the DOM / default theme if the Provider identity
 * was duplicated across chunks (dev HMR) instead of blanking the app.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[theme] useTheme called outside ThemeProvider — using DOM fallback",
    );
  }

  return fallbackThemeValue(readDomTheme() ?? APP_THEME_DEFAULT);
}
