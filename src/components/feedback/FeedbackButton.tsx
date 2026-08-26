"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { MessageCircleHeart } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { FeedbackMode } from "@/lib/feedback/categories";
import { isBetaFeedbackEnabled } from "@/lib/feedback/flags";
import { openFeedback } from "@/lib/feedback/open";
import { cn } from "@/lib/utils";

export type FeedbackButtonPlacement = "header" | "footer" | "floating";

type FeedbackButtonProps = {
  className?: string;
  /** Compact label on very small screens when true (default for header). */
  collapseLabel?: boolean;
  /**
   * Where the control lives — keeps relocation (e.g. under Contact Us) a one-prop change.
   * Prefer `placement` over deprecated `variant`.
   */
  placement?: FeedbackButtonPlacement;
  /**
   * @deprecated Use `placement` instead.
   */
  variant?: FeedbackButtonPlacement;
  /** Prefill modal mode when opened. */
  mode?: FeedbackMode;
  /**
   * Only render for signed-in users (default true).
   * Marketing + app entry points should stay auth-gated.
   */
  requireAuth?: boolean;
  /** Show the subtle Beta chip (default true for header/footer). */
  showBetaBadge?: boolean;
};

function isAppShellPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (path.startsWith("/sign-in") || path.startsWith("/sign-up")) return false;
  if (path.startsWith("/admin")) return true;
  const appRoots = [
    "/dashboard",
    "/media",
    "/upload",
    "/memories",
    "/movies",
    "/people",
    "/documents",
    "/legacy",
    "/accounts",
    "/family",
    "/family-tree",
    "/on-this-day",
    "/assistant",
    "/settings",
    "/billing",
    "/notifications",
    "/emergency-access",
    "/family-memory-box",
  ];
  return appRoots.some(
    (root) => path === root || path.startsWith(`${root}/`),
  );
}

/**
 * Opens the shared FeedbackModal (requires FeedbackHost in the tree).
 * Hidden when NEXT_PUBLIC_ENABLE_BETA_FEEDBACK is off.
 *
 * Placement makes public-launch moves easy:
 *   <FeedbackButton placement="header" />
 *   <FeedbackButton placement="footer" />   // e.g. under Contact Us
 *   <FeedbackButton placement="floating" />
 */
export function FeedbackButton({
  className,
  collapseLabel = true,
  placement,
  variant,
  mode,
  requireAuth = true,
  showBetaBadge,
}: FeedbackButtonProps) {
  const t = useTranslations();
  const pathname = usePathname() || "/";
  const { isLoaded, isSignedIn } = useAuth();
  const resolved: FeedbackButtonPlacement =
    placement ?? variant ?? "header";
  const badge =
    showBetaBadge ?? (resolved === "header" || resolved === "footer");

  if (!isBetaFeedbackEnabled()) return null;
  if (requireAuth) {
    if (!isLoaded || !isSignedIn) return null;
  }

  const label = t("feedback.linkLabel");
  const aria = badge ? t("feedback.linkAriaBeta") : t("feedback.linkAria");

  function handleClick() {
    openFeedback(mode ? { mode } : undefined);
  }

  if (resolved === "floating") {
    const clearAskAi = isAppShellPath(pathname);
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "fixed z-[85] inline-flex items-center gap-2 rounded-full border border-ink/10 bg-canvas/95 px-3.5 py-3 text-sm font-medium text-ink shadow-lg backdrop-blur-md transition hover:border-accent/30 hover:text-accent-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "right-[max(1.25rem,env(safe-area-inset-right,0px))]",
          clearAskAi
            ? "bottom-[max(5.75rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
            : "bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))]",
          className,
        )}
        aria-label={aria}
        aria-haspopup="dialog"
        data-feedback-placement="floating"
      >
        <MessageCircleHeart className="size-4 shrink-0" aria-hidden />
        <span>{label}</span>
        {badge ? (
          <span
            className="rounded-full bg-accent/12 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-accent-deep"
            aria-hidden
          >
            {t("feedback.betaBadge")}
          </span>
        ) : null}
      </button>
    );
  }

  if (resolved === "footer") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm text-ink-muted underline-offset-4 transition hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          className,
        )}
        aria-label={aria}
        aria-haspopup="dialog"
        data-feedback-placement="footer"
      >
        <MessageCircleHeart className="size-3.5 shrink-0" aria-hidden />
        <span>{label}</span>
        {badge ? (
          <span
            className="rounded-full bg-accent/12 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-accent-deep"
            aria-hidden
          >
            {t("feedback.betaBadge")}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "dashboard-icon-btn inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-2.5 py-2 text-ink-muted transition-colors hover:border-accent/30 hover:text-accent-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3",
        className,
      )}
      aria-label={aria}
      aria-haspopup="dialog"
      data-feedback-placement="header"
    >
      <MessageCircleHeart className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          "text-xs font-medium",
          collapseLabel ? "hidden sm:inline" : "inline",
        )}
      >
        {label}
      </span>
      {badge ? (
        <span
          className="rounded-full bg-accent/12 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-accent-deep"
          aria-hidden
        >
          {t("feedback.betaBadge")}
        </span>
      ) : null}
    </button>
  );
}
