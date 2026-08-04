"use client";

import { useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  APP_THEME_DEFAULT,
  readDomTheme,
  readStoredTheme,
  type AppTheme,
} from "@/lib/theme/types";
import { cn } from "@/lib/utils";

/**
 * Marketing-only chrome with clean Original ↔ Modern forks:
 * - Modern landing / auth: full-bleed cinematic (no classic footer; auth hides nav)
 * - Original: classic sticky nav + footer on all marketing pages including auth
 * Switching never mixes half-old / half-new public compositions.
 */
export function MarketingChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, ready } = useTheme();
  const [resolved, setResolved] = useState<AppTheme | null>(null);

  useLayoutEffect(() => {
    if (ready) {
      setResolved(theme);
      return;
    }
    setResolved(readDomTheme() ?? readStoredTheme() ?? APP_THEME_DEFAULT);
  }, [theme, ready]);

  const pending = resolved === null;
  const effective = resolved ?? APP_THEME_DEFAULT;
  const modern = effective === "modern";
  const isLanding = pathname === "/" || pathname === "";
  const isAuth =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isPricing = pathname.startsWith("/pricing");

  // While theme is unresolved on auth, hide classic chrome so Modern never
  // flashes Original nav/footer over the cinematic still.
  const cinematicModernAuth = modern && isAuth;
  const hideNav = cinematicModernAuth || (pending && isAuth);
  const hideFooter =
    cinematicModernAuth ||
    (pending && isAuth) ||
    (modern && (isLanding || isPricing));

  return (
    <div
      className={cn(
        "marketing-shell flex min-h-full flex-col",
        modern && "marketing-shell--modern",
        isLanding && "marketing-shell--landing",
        (cinematicModernAuth || (pending && isAuth)) &&
          "marketing-shell--cinematic-auth",
        modern && isPricing && "marketing-shell--pricing-modern",
      )}
      data-marketing-theme={effective}
    >
      {hideNav ? null : <MarketingNav />}
      <main
        className={cn(
          "marketing-shell-main flex-1",
          (cinematicModernAuth || (pending && isAuth)) &&
            "marketing-shell-main--flush",
        )}
      >
        {children}
      </main>
      {hideFooter ? null : <MarketingFooter />}
    </div>
  );
}
