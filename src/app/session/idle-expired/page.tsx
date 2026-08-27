"use client";

import { useClerk, useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import {
  inactivitySignInPath,
  prepareSilentIdleExpiry,
} from "@/lib/session/idle-session-sync";

/**
 * Middleware / deep-link target when the idle activity cookie shows the
 * current Clerk session is already past logout. Signs out without vault UI
 * or the in-session idle dialog.
 */
export default function IdleExpiredPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;
    prepareSilentIdleExpiry();

    if (!isSignedIn) {
      window.location.replace(inactivitySignInPath());
      return;
    }

    void signOut({ redirectUrl: inactivitySignInPath() }).catch(() => {
      window.location.replace(inactivitySignInPath());
    });
  }, [isLoaded, isSignedIn, signOut]);

  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--background)] px-6"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Signing out…</span>
    </main>
  );
}
