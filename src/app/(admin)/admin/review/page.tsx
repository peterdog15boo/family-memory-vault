import Link from "next/link";
import { Shield } from "lucide-react";
import { ReviewQueue } from "@/components/admin/ReviewQueue";
import { requireAdmin } from "@/lib/auth/admin";
import { listMediaNeedingHumanReview } from "@/lib/moderation/review";

export const dynamic = "force-dynamic";

/**
 * Admin-only human review queue.
 * Decisions are written to moderation_events (source: admin.review).
 */
export default async function AdminReviewPage() {
  const userId = await requireAdmin();
  const items = await listMediaNeedingHumanReview(userId, { limit: 50 });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">
            Human review
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-ink-muted">
            Borderline automated scores. Decisions and notes are audited.
            Family galleries never show these until marked clean.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-xs text-ink-muted">
            {items.length} item{items.length === 1 ? "" : "s"} in queue
          </p>
          <Link
            href="/admin/safety?status=needs_review"
            className="text-xs text-accent-deep hover:underline"
          >
            Safety filter →
          </Link>
        </div>
      </div>

      <p className="mt-6 flex gap-2 text-xs text-ink-muted">
        <Shield className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        Previews start blurred. Quarantine moves objects under{" "}
        <code className="text-ink">quarantine/</code> and triggers NCMEC reporting.
        Every action is logged to moderation history.
      </p>

      <div className="mt-8">
        <ReviewQueue
          items={items.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
