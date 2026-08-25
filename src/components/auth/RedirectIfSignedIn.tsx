"use client";

import { useAuth } from "@clerk/nextjs";
import { useLayoutEffect, type ReactNode } from "react";

/**
 * Once Clerk reports a signed-in session on an auth page, leave immediately.
 * Renders a calm handoff instead of the login/sign-up shell so post-auth
 * never flashes the marketing login UI (email OTP + Google SSO).
 *
 * Pending MFA / session tasks are treated as signed-out by Clerk’s default
 * `treatPendingAsSignedOut`, so `isSignedIn` alone is enough here.
 */
export function RedirectIfSignedIn({
  redirectTo,
  children,
}: {
  redirectTo: string;
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const readyToLeave = Boolean(isLoaded && isSignedIn);

  useLayoutEffect(() => {
    if (!readyToLeave) return;
    // Full navigation clears the auth route from the document so the
    // marketing login shell cannot remount during the app RSC handoff.
    window.location.replace(redirectTo);
  }, [readyToLeave, redirectTo]);

  if (readyToLeave) {
    return <PostAuthHandoff />;
  }

  return children;
}

function PostAuthHandoff() {
  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--background)] px-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="text-sm text-ink-muted">Loading…</p>
    </main>
  );
}
