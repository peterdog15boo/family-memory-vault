import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Figtree, Fraunces } from "next/font/google";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
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

export const metadata: Metadata = {
  title: "Family Memory Vault",
  description:
    "Preserve your family's most important memories — privately and safely. Built for families who value privacy and care.",
};

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${fraunces.variable} h-full antialiased`}
      data-theme={APP_THEME_DEFAULT}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="page-atmosphere min-h-full font-sans">
        <ClerkProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
