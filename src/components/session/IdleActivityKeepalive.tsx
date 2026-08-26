"use client";

import { useEffect } from "react";
import { resetIdleActivityClock } from "@/lib/session/idle-session-sync";

const DEFAULT_INTERVAL_MS = 30_000;

type Props = {
  /** How often to refresh the idle clock while this surface is mounted. */
  intervalMs?: number;
};

/**
 * Keeps the idle-timeout clock fresh on surfaces outside DashboardShell
 * (Welcome Ritual, legal agree) so a long first-session flow cannot inherit
 * a stale timer and force logout when entering the vault.
 */
export function IdleActivityKeepalive({
  intervalMs = DEFAULT_INTERVAL_MS,
}: Props) {
  useEffect(() => {
    resetIdleActivityClock();
    const id = window.setInterval(() => {
      resetIdleActivityClock();
    }, intervalMs);
    return () => {
      window.clearInterval(id);
      // Fresh timeout window when leaving ritual / legal for the vault.
      resetIdleActivityClock();
    };
  }, [intervalMs]);

  return null;
}
