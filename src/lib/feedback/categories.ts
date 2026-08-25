/**
 * Feedback mode, severity, and route → product category mapping.
 */

export const FEEDBACK_MODES = ["bug", "feature"] as const;
export type FeedbackMode = (typeof FEEDBACK_MODES)[number];

export const FEEDBACK_SEVERITIES = [
  "low",
  "medium",
  "high",
  "blocking",
] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export const FEEDBACK_CATEGORIES = [
  "Dashboard",
  "Photos & Media",
  "Memories",
  "Movies",
  "People",
  "Legacy Planning",
  "Documents",
  "Family Circle",
  "Ask AI",
  "Account & Billing",
  "Notifications",
  "Emergency Access",
  "Digitize",
  "Admin",
  "General",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/** Normalize a URL path for category matching (no query/hash/trailing slash). */
export function normalizeFeedbackPath(pathname: string): string {
  let path = (pathname || "/").trim();
  const hashIdx = path.indexOf("#");
  if (hashIdx >= 0) path = path.slice(0, hashIdx);
  const queryIdx = path.indexOf("?");
  if (queryIdx >= 0) path = path.slice(0, queryIdx);
  path = path.replace(/\/+/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (!path.startsWith("/")) path = `/${path}`;
  return path || "/";
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

type RouteRule = {
  category: FeedbackCategory;
  /** Exact path matches (after normalize). */
  exact?: readonly string[];
  /** Prefix matches. Longer / more specific prefixes should be listed first globally. */
  prefixes?: readonly string[];
  /** Optional predicate for special cases. */
  test?: (path: string) => boolean;
};

/**
 * Ordered rules — first match wins. Keep more specific routes above broad ones
 * (e.g. /documents/legacy before /documents).
 */
const ROUTE_CATEGORY_RULES: readonly RouteRule[] = [
  {
    category: "Dashboard",
    exact: ["/", "/dashboard", "/home"],
  },
  {
    category: "Photos & Media",
    prefixes: ["/media", "/upload", "/photos", "/gallery", "/library"],
  },
  {
    category: "Memories",
    prefixes: ["/memories", "/memory"],
  },
  {
    category: "Movies",
    prefixes: ["/movies", "/movie"],
  },
  {
    category: "People",
    prefixes: ["/people", "/faces", "/person"],
  },
  {
    category: "Legacy Planning",
    prefixes: ["/legacy", "/documents/legacy"],
    test: (path) =>
      path.includes("/legacy") && matchesPrefix(path, "/documents"),
  },
  {
    category: "Documents",
    prefixes: ["/documents", "/vault/documents"],
  },
  {
    category: "Digitize",
    prefixes: ["/family-memory-box", "/digitize", "/memory-box"],
  },
  {
    category: "Family Circle",
    prefixes: ["/family"],
    // /family-memory-box handled above as Digitize
    test: (path) =>
      matchesPrefix(path, "/family") && !matchesPrefix(path, "/family-memory-box"),
  },
  {
    category: "Ask AI",
    prefixes: ["/assistant", "/ask-ai", "/ava"],
  },
  {
    category: "Account & Billing",
    prefixes: [
      "/settings",
      "/billing",
      "/pricing",
      "/account",
      "/plan",
      "/subscription",
    ],
  },
  {
    category: "Notifications",
    prefixes: ["/notifications", "/alerts"],
  },
  {
    category: "Emergency Access",
    prefixes: ["/emergency-access", "/emergency"],
  },
  {
    category: "Admin",
    prefixes: ["/admin", "/ops"],
  },
  {
    category: "General",
    // Marketing / auth surfaces — still useful triage for beta
    prefixes: [
      "/sign-in",
      "/sign-up",
      "/privacy",
      "/terms",
      "/contact",
      "/beta-agree",
      "/terms-agree",
      "/legal-agree",
      "/suspended",
    ],
  },
];

/**
 * Map an app pathname (or full URL path) to a triage category for beta feedback.
 * Used as the smart default on both Bug Report and Feature Request forms.
 */
export function categoryFromPathname(pathname: string): FeedbackCategory {
  const path = normalizeFeedbackPath(pathname);

  for (const rule of ROUTE_CATEGORY_RULES) {
    if (rule.exact?.some((exact) => path === exact)) {
      return rule.category;
    }
    if (rule.prefixes?.some((prefix) => matchesPrefix(path, prefix))) {
      // Digitize vs Family Circle: family-memory-box is listed under Digitize first.
      if (rule.category === "Family Circle" && matchesPrefix(path, "/family-memory-box")) {
        continue;
      }
      return rule.category;
    }
    if (rule.test?.(path)) {
      return rule.category;
    }
  }

  return "General";
}

/**
 * Whether a string is a known feedback category (for API validation helpers).
 */
export function isFeedbackCategory(value: string): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(value);
}
