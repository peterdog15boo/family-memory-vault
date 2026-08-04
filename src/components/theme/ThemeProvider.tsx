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

type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  /** Switch to Original. */
  restoreOriginal: () => void;
  /** Switch to Modern (site default). */
  useModernDefault: () => void;
  toggleTheme: () => void;
  ready: boolean;
  isModern: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function persistTheme(theme: AppTheme) {
  persistThemePreference(theme);
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

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
  const useModernDefault = useCallback(() => {
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
      useModernDefault,
      toggleTheme,
      ready,
      isModern: theme === "modern",
    }),
    [theme, setTheme, restoreOriginal, useModernDefault, toggleTheme, ready],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
