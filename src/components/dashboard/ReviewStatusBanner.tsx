import Link from "next/link";
import { Clock3, Shield } from "lucide-react";
import { COPY } from "@/lib/copy";
import type { MediaReviewSummary } from "@/lib/media/queries";

type ReviewStatusBannerProps = {
  summary: MediaReviewSummary;
};

/**
 * Subtle status only — never reveal CSAM / quarantine details to end users.
 */
export function ReviewStatusBanner({ summary }: ReviewStatusBannerProps) {
  const { pendingCount, quarantinedCount, rejectedCount } = summary;
  const needsAttention = pendingCount + quarantinedCount + rejectedCount;

  if (needsAttention === 0) return null;

  let message: string = COPY.review.mixed;
  if (pendingCount > 0 && quarantinedCount + rejectedCount === 0) {
    message =
      pendingCount === 1
        ? COPY.review.pendingOne
        : COPY.review.pendingMany(pendingCount);
  } else if (pendingCount === 0 && (quarantinedCount > 0 || rejectedCount > 0)) {
    message = COPY.review.attention;
  }

  return (
    <div className="app-banner flex gap-3 rounded-xl border border-ink/10 bg-canvas-deep/70 px-4 py-3 text-sm text-ink-muted">
      {pendingCount > 0 ? (
        <Clock3 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      ) : (
        <Shield className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="leading-relaxed">{message}</p>
        {pendingCount > 0 ? (
          <Link
            href="/media"
            className="mt-1 inline-flex text-xs font-medium text-accent-deep hover:text-accent"
          >
            View Photos
          </Link>
        ) : null}
      </div>
    </div>
  );
}
