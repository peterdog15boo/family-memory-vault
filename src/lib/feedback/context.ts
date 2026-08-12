/**
 * Client-side environment + route context for beta feedback submissions.
 */

import {
  categoryFromPathname,
  type FeedbackCategory,
} from "@/lib/feedback/categories";
import { getRecentConsoleErrors } from "@/lib/feedback/console-buffer";

export type FeedbackClientContext = {
  url: string;
  pathname: string;
  category: FeedbackCategory;
  browser: string;
  os: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  userAgent: string;
  timestamp: string;
  consoleErrors: string[];
  userId: string | null;
  email: string | null;
};

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  if (/Firefox\//i.test(ua)) return "Firefox";
  return "Unknown";
}

function parseOs(ua: string): string {
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua) || /Macintosh/i.test(ua)) return "macOS";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Linux/i.test(ua)) return "Linux";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  return "Unknown";
}

export function collectFeedbackContext(input?: {
  userId?: string | null;
  email?: string | null;
  pathname?: string;
}): FeedbackClientContext {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const pathname =
    input?.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const url =
    typeof window !== "undefined"
      ? window.location.href
      : pathname;

  return {
    url,
    pathname,
    category: categoryFromPathname(pathname),
    browser: parseBrowser(ua),
    os: parseOs(ua),
    viewportWidth:
      typeof window !== "undefined" ? Math.round(window.innerWidth) : 0,
    viewportHeight:
      typeof window !== "undefined" ? Math.round(window.innerHeight) : 0,
    devicePixelRatio:
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    userAgent: ua.slice(0, 512),
    timestamp: new Date().toISOString(),
    consoleErrors: getRecentConsoleErrors(),
    userId: input?.userId ?? null,
    email: input?.email ?? null,
  };
}
