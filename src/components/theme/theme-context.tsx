"use client";

import { createContext, type ReactNode } from "react";
import type { AppTheme } from "@/lib/theme/types";

export type ThemeContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  /** Switch to Original. */
  restoreOriginal: () => void;
  /** Switch to Modern (site default). */
  applyModernDefault: () => void;
  toggleTheme: () => void;
  ready: boolean;
  isModern: boolean;
};

/**
 * Isolated module so Provider + consumers share one Context identity
 * across webpack page/layout chunk splits (avoids “useTheme must be used
 * within ThemeProvider” when a duplicate createContext sneaks in).
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  children: ReactNode;
};
