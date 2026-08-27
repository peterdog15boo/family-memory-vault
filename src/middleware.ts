import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { LogEvents } from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";
import { IDLE_EXPIRED_PATH, resolvePostAuthPath } from "@/lib/routes";
import {
  isIdleActivityExpiredForSession,
  readIdleActivityCookieFromHeader,
} from "@/lib/session/idle-session-cookie";

/**
 * Protect the authenticated app surfaces.
 * Unauthenticated visitors are sent back to the marketing landing page.
 */
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/upload(.*)",
  "/documents(.*)",
  "/accounts(.*)",
  "/emergency-access(.*)",
  "/memories(.*)",
  "/movies(.*)",
  "/people(.*)",
  "/family(.*)",
  "/legacy(.*)",
  "/settings(.*)",
  "/media(.*)",
  "/on-this-day(.*)",
  "/billing(.*)",
  "/notifications(.*)",
  "/assistant(.*)",
  "/admin(.*)",
  "/suspended",
  "/beta-agree",
  "/terms-agree",
  "/legal-agree",
  "/first-family-movie(.*)",
  "/api/beta-nda(.*)",
  "/api/terms(.*)",
  "/api/legal(.*)",
  "/api/upload-url",
  "/api/upload(.*)",
  "/api/documents(.*)",
  "/api/accounts(.*)",
  "/api/plaid(.*)",
  "/api/legacy(.*)",
  "/api/emergency-access(.*)",
  "/api/media(.*)",
  "/api/faces(.*)",
  "/api/memories(.*)",
  "/api/people(.*)",
  "/api/family(.*)",
  "/api/admin(.*)",
  "/api/billing(.*)",
  "/api/movies(.*)",
  "/api/notifications(.*)",
  "/api/onboarding(.*)",
  "/api/first-family-movie(.*)",
  "/api/journey(.*)",
  "/api/ava(.*)",
  "/api/assistant(.*)",
  "/api/settings(.*)",
  "/api/push(.*)",
]);

/**
 * Auth entry URLs only — not Clerk step paths like /sign-in/sso-callback or
 * /sign-in/factor-one, which must still render to finish the handshake.
 */
const isAuthEntryRoute = createRouteMatcher(["/sign-in", "/sign-up"]);

const isIdleExpiredRoute = createRouteMatcher([IDLE_EXPIRED_PATH]);

function makeRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function signInUrlFor(request: Request): string {
  const url = new URL(request.url);
  const returnPath = `${url.pathname}${url.search}`;
  const signIn = new URL("/sign-in", request.url);
  // Preserve deep links (e.g. /family/accept?token=…) after Clerk auth.
  if (returnPath && returnPath !== "/" && returnPath !== "/sign-in") {
    signIn.searchParams.set("redirect_url", returnPath);
  }
  return signIn.toString();
}

function idleExpiredRedirect(request: Request): NextResponse {
  return NextResponse.redirect(new URL(IDLE_EXPIRED_PATH, request.url));
}

function shouldSilentIdleRedirect(
  request: Request,
  sessionId: string | null | undefined,
): boolean {
  if (!sessionId) return false;
  if (isIdleExpiredRoute(request)) return false;
  const cookie = readIdleActivityCookieFromHeader(
    request.headers.get("cookie"),
  );
  return isIdleActivityExpiredForSession(cookie, sessionId);
}

export default clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const requestId =
    request.headers.get("x-request-id")?.trim() || makeRequestId();

  // Continuous session past idle logout → silent handoff before any app UI.
  // Skip APIs (clients handle 401 / own auth); cookie absent → no-op (fresh
  // login or paid-disabled).
  if (!isApi) {
    const { userId, sessionId, sessionStatus } = await auth();
    if (
      userId &&
      sessionStatus !== "pending" &&
      shouldSilentIdleRedirect(request, sessionId)
    ) {
      return idleExpiredRedirect(request);
    }
  }

  // Already signed in on /sign-in or /sign-up → vault (or deep link) before
  // any marketing login UI can paint (OAuth return + refresh cases).
  // Skip pending sessions (MFA / tasks) so Clerk can finish on the auth page.
  if (isAuthEntryRoute(request)) {
    const { userId, sessionStatus } = await auth();
    if (userId && sessionStatus !== "pending") {
      const dest = resolvePostAuthPath(
        request.nextUrl.searchParams.get("redirect_url"),
      );
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  if (isProtectedRoute(request)) {
    await auth.protect({
      unauthenticatedUrl: isApi
        ? new URL("/", request.url).toString()
        : signInUrlFor(request),
    });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-pathname", path);
  // Preserve query for server pages that need it (e.g. local ritual preview).
  requestHeaders.set("x-search", request.nextUrl.search);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);

  // Basic API access log (skip noisy health probes).
  if (isApi && path !== "/api/health") {
    logger.info(LogEvents.httpRequest, {
      requestId,
      method: request.method,
      path,
    });
  }

  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
