"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. Defaults to `false` until mounted (SSR-safe).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    function sync() {
      setMatches(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

/** Phone width, or short landscape below the desktop sidebar breakpoint. */
export const SHELL_COMPACT_CHROME_MQ =
  "(max-width: 1023px) and ((max-width: 639px) or (max-height: 500px))";
