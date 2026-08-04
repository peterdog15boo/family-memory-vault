/**
 * Same-origin checks for browser-facing mutating API routes.
 *
 * Stripe webhooks and worker/cron drains are server-to-server and should
 * skip this (they use signature / shared-secret auth instead).
 *
 * Trust model:
 * 1. Origin/Referer matches the request's own host (LAN / tunnel / preview)
 * 2. Origin/Referer matches configured NEXT_PUBLIC_APP_URL / APP_URL
 * 3. Origin is listed in ALLOWED_BROWSER_ORIGINS (comma-separated)
 * 4. In development, missing Origin is allowed (curl / same-origin fetch)
 */

import { NextResponse } from "next/server";
import { getAppUrl, isProduction } from "@/lib/env";

export type OriginTrustDecision = {
  trusted: boolean;
  reason: string;
  origin: string | null;
  referer: string | null;
  requestOrigin: string;
  expectedOrigins: string[];
};

function originBase(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

function tryParseOrigin(value: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    return originBase(new URL(value));
  } catch {
    return null;
  }
}

function configuredAppOrigins(): string[] {
  const out: string[] = [];
  try {
    out.push(originBase(new URL(getAppUrl())));
  } catch {
    // ignore invalid app URL
  }

  const extra = process.env.ALLOWED_BROWSER_ORIGINS?.trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const parsed = tryParseOrigin(
        trimmed.includes("://") ? trimmed : `https://${trimmed}`,
      );
      if (parsed) out.push(parsed);
    }
  }

  return [...new Set(out)];
}

function isPrivateOrLocalHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  ) {
    return true;
  }
  // RFC1918 + link-local
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }
  return false;
}

/**
 * Evaluate whether a browser Origin/Referer is trusted for mutating APIs.
 * Prefer matching the request host so phones on LAN (http://192.168.x.x:3000)
 * are not rejected when NEXT_PUBLIC_APP_URL is still localhost.
 */
export function evaluateBrowserOrigin(request: Request): OriginTrustDecision {
  let requestOrigin: string;
  try {
    requestOrigin = originBase(new URL(request.url));
  } catch {
    return {
      trusted: false,
      reason: "invalid_request_url",
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer"),
      requestOrigin: "",
      expectedOrigins: configuredAppOrigins(),
    };
  }

  const expectedOrigins = [
    ...new Set([requestOrigin, ...configuredAppOrigins()]),
  ];

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");

  if (originHeader) {
    const origin = tryParseOrigin(originHeader);
    if (!origin) {
      return {
        trusted: false,
        reason: "malformed_origin",
        origin: originHeader,
        referer: refererHeader,
        requestOrigin,
        expectedOrigins,
      };
    }
    if (expectedOrigins.includes(origin)) {
      return {
        trusted: true,
        reason: "origin_matches_expected",
        origin: originHeader,
        referer: refererHeader,
        requestOrigin,
        expectedOrigins,
      };
    }
    // Dev convenience: phone/desktop on different local hosts talking to local server
    if (
      !isProduction() &&
      isPrivateOrLocalHost(new URL(origin).host) &&
      isPrivateOrLocalHost(new URL(requestOrigin).host)
    ) {
      return {
        trusted: true,
        reason: "dev_local_network",
        origin: originHeader,
        referer: refererHeader,
        requestOrigin,
        expectedOrigins,
      };
    }
    return {
      trusted: false,
      reason: "origin_mismatch",
      origin: originHeader,
      referer: refererHeader,
      requestOrigin,
      expectedOrigins,
    };
  }

  if (refererHeader) {
    const referer = tryParseOrigin(refererHeader);
    if (!referer) {
      return {
        trusted: false,
        reason: "malformed_referer",
        origin: originHeader,
        referer: refererHeader,
        requestOrigin,
        expectedOrigins,
      };
    }
    if (expectedOrigins.includes(referer)) {
      return {
        trusted: true,
        reason: "referer_matches_expected",
        origin: originHeader,
        referer: refererHeader,
        requestOrigin,
        expectedOrigins,
      };
    }
    if (
      !isProduction() &&
      isPrivateOrLocalHost(new URL(referer).host) &&
      isPrivateOrLocalHost(new URL(requestOrigin).host)
    ) {
      return {
        trusted: true,
        reason: "dev_local_network_referer",
        origin: originHeader,
        referer: refererHeader,
        requestOrigin,
        expectedOrigins,
      };
    }
    return {
      trusted: false,
      reason: "referer_mismatch",
      origin: originHeader,
      referer: refererHeader,
      requestOrigin,
      expectedOrigins,
    };
  }

  // Browsers always send Origin on cross-site POSTs; same-site may omit it.
  // In production, require at least one signal for mutating routes that call this.
  if (!isProduction()) {
    return {
      trusted: true,
      reason: "dev_missing_origin",
      origin: originHeader,
      referer: refererHeader,
      requestOrigin,
      expectedOrigins,
    };
  }

  return {
    trusted: false,
    reason: "missing_origin_and_referer",
    origin: originHeader,
    referer: refererHeader,
    requestOrigin,
    expectedOrigins,
  };
}

/**
 * Returns true when the request Origin (or Referer) matches a trusted app host.
 */
export function isTrustedBrowserOrigin(request: Request): boolean {
  return evaluateBrowserOrigin(request).trusted;
}

/** 403 response when Origin/Referer is not trusted. */
export function rejectUntrustedOrigin(request: Request): NextResponse | null {
  const decision = evaluateBrowserOrigin(request);
  if (decision.trusted) return null;

  console.warn("[security.origin] rejected untrusted browser origin", {
    reason: decision.reason,
    origin: decision.origin,
    referer: decision.referer,
    requestOrigin: decision.requestOrigin,
    expectedOrigins: decision.expectedOrigins,
  });

  return NextResponse.json(
    {
      error:
        "This upload request didn’t come from a trusted app address. Open the vault from your usual link and try again.",
      code: "untrusted_origin",
      reason: decision.reason,
    },
    { status: 403 },
  );
}
