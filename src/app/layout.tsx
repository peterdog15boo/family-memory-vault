import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Figtree, Fraunces } from "next/font/google";
import { FeedbackHost } from "@/components/feedback/FeedbackHost";
import { LiveAnnouncer } from "@/components/a11y/LiveAnnouncer";
import { RouteAnnouncer } from "@/components/a11y/RouteAnnouncer";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
} from "@/lib/i18n/locales";
import { getLocale, getTranslations } from "@/lib/i18n/server";
import { APP_HOME_PATH } from "@/lib/routes";
import {
  APP_THEME_DEFAULT,
  APP_THEME_STORAGE_KEY,
} from "@/lib/theme/types";
import "./globals.css";

/**
 * Clerk session cookies are Secure + HttpOnly when the app is served over HTTPS.
 * Set NEXT_PUBLIC_APP_URL to your https production origin so redirects and
 * invites stay on the correct host.
 */

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("meta.defaultTitle"),
    description: t("meta.defaultDescription"),
  };
}

/** Resize layout with the on-screen keyboard so floating sheets stay usable. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

/** Prevents a flash of the wrong theme before React hydrates. */
const themeBootScript = `
(function(){
  var fallback = ${JSON.stringify(APP_THEME_DEFAULT)};
  try {
    var key = ${JSON.stringify(APP_THEME_STORAGE_KEY)};
    var q = new URLSearchParams(location.search).get("theme");
    var t = (q === "modern" || q === "original") ? q : localStorage.getItem(key);
    if (t !== "modern" && t !== "original") t = fallback;
    document.documentElement.setAttribute("data-theme", t);
    try {
      document.cookie = key + "=" + t + "; path=/; max-age=31536000; SameSite=Lax";
    } catch (eCookie) {}
    if (q === "modern" || q === "original") {
      try { localStorage.setItem(key, t); } catch (e2) {}
    }
  } catch (e) {
    document.documentElement.setAttribute("data-theme", fallback);
  }
})();
`;

/** Apply stored locale before paint so html[lang] matches guest preference. */
const localeBootScript = `
(function(){
  var fallback = ${JSON.stringify(DEFAULT_LOCALE)};
  var key = ${JSON.stringify(LOCALE_STORAGE_KEY)};
  var allowed = ${JSON.stringify([...APP_LOCALES])};
  try {
    var q = new URLSearchParams(location.search).get("lang") || new URLSearchParams(location.search).get("locale");
    var t = q || localStorage.getItem(key);
    if (!t || allowed.indexOf(t) === -1) return;
    document.documentElement.setAttribute("lang", t);
    document.documentElement.setAttribute("data-locale", t);
    try {
      document.cookie = key + "=" + encodeURIComponent(t) + "; path=/; max-age=31536000; SameSite=Lax";
    } catch (eCookie) {}
    if (q && allowed.indexOf(q) !== -1) {
      try { localStorage.setItem(key, q); } catch (e2) {}
    }
  } catch (e) {
    document.documentElement.setAttribute("lang", fallback);
    document.documentElement.setAttribute("data-locale", fallback);
  }
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${figtree.variable} ${fraunces.variable} h-full antialiased`}
      data-theme={APP_THEME_DEFAULT}
      data-locale={locale}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script dangerouslySetInnerHTML={{ __html: localeBootScript }} />
      </head>
      <body className="page-atmosphere min-h-full font-sans">
        <ClerkProvider
          signInFallbackRedirectUrl={APP_HOME_PATH}
          signUpFallbackRedirectUrl={APP_HOME_PATH}
        >
          <ThemeProvider>
            <LocaleProvider initialLocale={locale}>
              <LiveAnnouncer />
              <RouteAnnouncer />
              {children}
              <FeedbackHost />
            </LocaleProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
