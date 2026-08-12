"use client";

import { useEffect } from "react";
import { syncGrantedPushSubscription } from "@/lib/push/browser";

/** Quietly refresh an already-granted device subscription. Never prompts. */
export function PushSubscriptionSync() {
  useEffect(() => {
    void syncGrantedPushSubscription().catch(() => {
      /* permission or network — ignore */
    });
  }, []);
  return null;
}
