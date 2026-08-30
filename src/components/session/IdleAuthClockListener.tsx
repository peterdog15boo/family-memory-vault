"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import {
  beginFreshIdleClock,
  clearIdleSessionState,
  readIdleAuthSessionId,
} from "@/lib/session/idle-session-sync";

/**
 * Root Clerk lifecycle hook for the idle clock.
 *
 * Sign-out: clear lastActivityAt / warning so the next login cannot inherit
 * yesterday’s stamp (that caused the immediate “expired” dialog).
 * Sign-in / new Clerk session id: lastActivityAt = now. Never expire on
 * that event. Already-signed-in loads (overnight tab) keep the stored stamp.
 */
export function IdleAuthClockListener() {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const wasSignedInRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      clearIdleSessionState();
      wasSignedInRef.current = false;
      return;
    }

    const prev = wasSignedInRef.current;
    wasSignedInRef.current = true;

    if (!sessionId) return;

    // Rising edge only: a brand-new sign-in. Do not treat first paint of an
    // already-signed-in tab as sign-in (that revived overnight lastActivity).
    // Do not rewrite the clock after a silent expire that already cleared stamps
    // while Clerk is still reporting signed-in.
    if (prev === false) {
      beginFreshIdleClock(sessionId);
      return;
    }

    if (prev === true && readIdleAuthSessionId() !== sessionId) {
      beginFreshIdleClock(sessionId);
    }
  }, [isLoaded, isSignedIn, sessionId]);

  return null;
}
