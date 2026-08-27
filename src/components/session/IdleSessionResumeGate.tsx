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
 * already past idle (~2h) or max lifetime (12h), silent sign-out → sign-in
 * (no vault, no idle warning dialog). Fresh logins reset clocks and continue.
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

    if (shouldSilentExpireIdleSession(sessionId, Date.now(), { checkIdle: enabled })) {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      setReady(false);
      prepareSilentIdleExpiry();
      void signOut({ redirectUrl: inactivitySignInPath() });
      return;
    }

    if (sessionId) {
      bootstrapIdleActivityForAuthSession(sessionId);
    }
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
