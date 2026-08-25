"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { FeedbackModal } from "@/components/feedback/FeedbackModal";
import type { FeedbackMode } from "@/lib/feedback/categories";
import { ensureConsoleErrorBuffer } from "@/lib/feedback/console-buffer";
import { isBetaFeedbackEnabled } from "@/lib/feedback/flags";
import {
  FEEDBACK_OPEN_EVENT,
  type FeedbackOpenDetail,
} from "@/lib/feedback/open";

type FeedbackHostProps = {
  /** Render the authenticated floating action button (default true). */
  showFloating?: boolean;
};

function shouldHideFloatingFab(pathname: string, modalOpen: boolean): boolean {
  if (modalOpen) return true;
  const path = pathname.split("?")[0] || "/";
  // Legal / beta gates + first-session ritual: keep primary CTAs unobstructed.
  if (
    path.startsWith("/legal-agree") ||
    path.startsWith("/terms-agree") ||
    path.startsWith("/beta-agree") ||
    path.startsWith("/first-family-movie")
  ) {
    return true;
  }
  return false;
}

/**
 * Site-wide beta feedback host: modal + optional authenticated FAB.
 * Mount once near the root so marketing and app chrome share one modal.
 * FAB stays off while the dialog is open and on Terms/Beta gates so it
 * never covers inputs or Continue.
 */
export function FeedbackHost({ showFloating = true }: FeedbackHostProps) {
  const enabled = isBetaFeedbackEnabled();
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<FeedbackMode>("bug");

  useEffect(() => {
    if (!enabled) return;
    ensureConsoleErrorBuffer();

    function onOpen(event: Event) {
      const detail = (event as CustomEvent<FeedbackOpenDetail>).detail;
      setMode(detail?.mode === "feature" ? "feature" : "bug");
      setOpen(true);
    }

    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
  }, [enabled]);

  if (!enabled) return null;

  const showFab =
    showFloating && !shouldHideFloatingFab(pathname, open);

  return (
    <>
      {showFab ? (
        <FeedbackButton placement="floating" showBetaBadge />
      ) : null}
      <FeedbackModal
        open={open}
        initialMode={mode}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
