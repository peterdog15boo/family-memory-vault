"use client";

import { useClerk, useAuth } from "@clerk/nextjs";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  bootstrapIdleActivityForAuthSession,
  inactivitySignInPath,
  prepareSilentIdleExpiry,
  shouldSilentExpireIdleSession,
  writeIdleTimeoutEnabledPreference,
} from "@/lib/session/idle-session-sync";

/**
 * Runs before authenticated shells paint. If the continuous Clerk session is
 * already past idle (15m, or 17m if the warning was shown) or max lifetime (12h),
 * silent sign-out → sign-in (no vault, no idle warning dialog).
 * Fresh logins reset clocks via IdleAuthClockListener and continue.
 */
export function IdleSessionResumeGate({
  children,
  enabled = true,
}: {
  children: ReactNode;
  /** When false (paid user disabled idle timeout), skip idle — max lifetime still applies. */
  enabled?: boolean;
}) {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const { signOut } = useClerk();
  const [ready, setReady] = useState(false);
  const signingOutRef = useRef(false);

  useLayoutEffect(() => {
    writeIdleTimeoutEnabledPreference(enabled);
    if (!isLoaded) return;

    if (!isSignedIn) {
      setReady(true);
      return;
    }

    // Wait for Clerk session id. Do not treat “id not ready” as a fresh login
    // (that reset lastActivityAt and kept overnight tabs alive).
    if (!sessionId) return;

    if (shouldSilentExpireIdleSession(sessionId, Date.now(), { checkIdle: enabled })) {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      setReady(false);
      prepareSilentIdleExpiry();
      void signOut({ redirectUrl: inactivitySignInPath() });
      return;
    }

    bootstrapIdleActivityForAuthSession(sessionId);
    setReady(true);
  }, [enabled, isLoaded, isSignedIn, sessionId, signOut]);

  if (!ready) {
    return (
      <main
        className="min-h-[100dvh] bg-[var(--background)]"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="sr-only">Checking session…</span>
      </main>
    );
  }

  return children;
}
