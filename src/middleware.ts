import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { LogEvents } from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";

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

export default clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const requestId =
    request.headers.get("x-request-id")?.trim() || makeRequestId();

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
