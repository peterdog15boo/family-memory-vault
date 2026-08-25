"use client";

import { useAuth, useClerk, useSession } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Clerk path segments where the marketing shell must not be visible. */
const HANDSHAKE_RE = /\/(sso-callback|verify)(\/|$)/i;

/**
 * After Clerk auth succeeds (or while SSO callback runs), never paint the
 * marketing login/sign-up shell. Keep the Clerk widget mounted (hidden) so
 * the handshake can finish, show a calm handoff, then hard-navigate to the
 * vault / deep link.
 *
 * This is partly a Clerk timing issue: session activation and redirect can
 * lag 1–2s behind a completed factor; we cover that gap in our UI.
 */
export function RedirectIfSignedIn({
  redirectTo,
  initialHandshake = false,
  children,
}: {
  redirectTo: string;
  /** Server-detected SSO/verify path so the first HTML paint skips the shell. */
  initialHandshake?: boolean;
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const clerk = useClerk();
  const pathname = usePathname() || "";
  const [leaving, setLeaving] = useState(false);
  const navigated = useRef(false);

  const isHandshake =
    initialHandshake || HANDSHAKE_RE.test(pathname);

  const sessionActive =
    session?.status === "active" || Boolean(isLoaded && isSignedIn);

  const hideAuthShell = leaving || sessionActive || isHandshake;

  const go = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    setLeaving(true);
    window.location.replace(redirectTo);
  }, [redirectTo]);

  useLayoutEffect(() => {
    if (sessionActive) go();
  }, [sessionActive, go]);

  useEffect(() => {
    if (!clerk?.addListener) return;
    return clerk.addListener(({ session: next }) => {
      if (next?.status === "active") go();
    });
  }, [clerk, go]);

  if (hideAuthShell) {
    return (
      <>
        <PostAuthHandoff />
        {/* Clerk must still mount for SSO callback / finalize; keep off-screen. */}
        <div
          className="pointer-events-none fixed h-px w-px overflow-hidden opacity-0"
          aria-hidden
        >
          {children}
        </div>
      </>
    );
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
