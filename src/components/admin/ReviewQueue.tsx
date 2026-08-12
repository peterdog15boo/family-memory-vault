"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Film, ImageIcon, ShieldAlert } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { confirmAdminAction } from "@/lib/admin/confirm";
import { cn } from "@/lib/utils";
import { hasProcessingFailedLabel } from "@/lib/moderation/processing-failed";
import type { HumanReviewAction, HumanReviewQueueItem } from "@/lib/moderation/review";

type ReviewQueueProps = {
  items: Array<
    Omit<HumanReviewQueueItem, "createdAt" | "updatedAt"> & {
      createdAt: string;
      updatedAt: string;
    }
  >;
};

const ACTIONS: Array<{
  action: HumanReviewAction;
  label: string;
  className: string;
  confirm?: string;
}> = [
  {
    action: "clean",
    label: "Approve as clean",
    className: "bg-accent text-accent-foreground hover:bg-accent-deep",
    confirm:
      "Approve this media as clean?\n\nIt can appear in family galleries once ready.",
  },
  {
    action: "adult",
    label: "Mark as adult",
    className: "bg-ink/10 text-ink hover:bg-ink/15",
    confirm:
      "Mark this media as adult?\n\nIt will stay out of family-safe surfaces.",
  },
  {
    action: "rejected",
    label: "Reject",
    className: "bg-ink/10 text-ink hover:bg-ink/15",
    confirm:
      "Reject this media?\n\nIt will not be available in family galleries.",
  },
  {
    action: "csam_quarantined",
    label: "Quarantine as CSAM",
    className: "bg-red-800 text-white hover:bg-red-900",
    confirm:
      "Quarantine this item as CSAM?\n\nThis moves the object to quarantine/ and triggers the NCMEC reporting path. The decision is audited.",
  },
];

function scoreLabel(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(3);
}

export function ReviewQueue({ items: initialItems }: ReviewQueueProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function submitAction(mediaId: string, action: HumanReviewAction) {
    const meta = ACTIONS.find((a) => a.action === action);
    if (meta?.confirm && !confirmAdminAction(meta.confirm)) return;

    setError(null);
    setPendingId(mediaId);

    try {
      const response = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId,
          action,
          notes: notes[mediaId]?.trim() || undefined,
        }),
      });
      const json = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Review action failed");
      }

      setItems((prev) => prev.filter((item) => item.id !== mediaId));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed");
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <AdminEmptyState
        icon={ShieldAlert}
        title="Queue empty"
        description="No media is waiting for human review right now. Borderline scores and failed scans appear here after automated moderation."
        actionHref="/admin/safety?status=needs_review"
        actionLabel="Open safety filter →"
      />
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-md border border-red-800/20 bg-red-800/10 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <ul className="space-y-5">
        {items.map((item) => {
          const isRevealed = Boolean(revealed[item.id]);
          const busy = pendingId === item.id || isPending;

          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-xl border border-ink/10 bg-canvas-deep/50"
            >
              <div className="grid gap-0 md:grid-cols-[220px_1fr]">
                <div className="relative aspect-square bg-ink/5 md:aspect-auto md:min-h-56">
                  {item.previewUrl ? (
                    item.type === "video" ? (
                      <video
                        src={item.previewUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className={cn(
                          "h-full w-full object-cover transition",
                          !isRevealed && "scale-105 blur-xl",
                        )}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewUrl}
                        alt=""
                        className={cn(
                          "h-full w-full object-cover transition",
                          !isRevealed && "scale-105 blur-xl",
                        )}
                      />
                    )
                  ) : (
                    <div className="flex h-full min-h-56 flex-col items-center justify-center gap-2 text-ink-muted">
                      {item.type === "video" ? (
                        <Film className="size-7 opacity-40" aria-hidden />
                      ) : (
                        <ImageIcon className="size-7 opacity-40" aria-hidden />
                      )}
                      <span className="text-xs">Preview unavailable</span>
                    </div>
                  )}

                  {!isRevealed && item.previewUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRevealed((prev) => ({ ...prev, [item.id]: true }))
                      }
                      className="absolute inset-0 flex items-center justify-center bg-ink/35 text-sm font-medium text-accent-foreground"
                    >
                      Reveal media
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-col gap-4 p-5">
                  <div>
                    <p className="font-display text-lg text-ink">
                      {item.originalFilename || "Untitled media"}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {item.type} · {item.contentType} ·{" "}
                      <Link
                        href={`/admin/safety/${item.id}`}
                        className="text-accent-deep hover:underline"
                      >
                        metadata
                      </Link>
                    </p>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div className="rounded-md bg-canvas px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-ink-muted">
                        PhotoDNA
                      </dt>
                      <dd className="mt-1 font-medium text-ink">
                        {item.photodnaMatch ? "Match" : "No match"}
                      </dd>
                    </div>
                    <div className="rounded-md bg-canvas px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-ink-muted">
                        AI CSAM
                      </dt>
                      <dd className="mt-1 font-medium text-ink">
                        {scoreLabel(item.aiCsamScore)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-canvas px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-ink-muted">
                        AI nudity
                      </dt>
                      <dd className="mt-1 font-medium text-ink">
                        {scoreLabel(item.aiNudityScore)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-canvas px-3 py-2">
                      <dt className="text-[11px] uppercase tracking-wide text-ink-muted">
                        Status
                      </dt>
                      <dd className="mt-1 font-medium text-ink">
                        {item.moderationStatus}
                      </dd>
                    </div>
                  </dl>

                  {hasProcessingFailedLabel(item.moderationLabels) ? (
                    <p className="rounded-md border border-amber-800/20 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      Automated scan failed (timeout or vendor error) — not a
                      policy hit. Approve as clean if the photo looks
                      appropriate, or retry the job from Ops.
                    </p>
                  ) : item.moderationStatus === "adult" ||
                    item.moderationStatus === "rejected" ? (
                    <p className="rounded-md border border-amber-800/20 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      The scanner hid this from Photos. Beach, swimwear, or
                      similar family photos are often false positives — approve
                      as clean if it looks appropriate.
                    </p>
                  ) : null}

                  {item.moderationLabels?.labels?.length ? (
                    <p className="text-xs text-ink-muted">
                      Labels: {item.moderationLabels.labels.join(", ")}
                    </p>
                  ) : null}

                  <label className="block text-xs text-ink-muted">
                    Notes (audited)
                    <textarea
                      value={notes[item.id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      rows={2}
                      maxLength={2000}
                      disabled={busy}
                      placeholder="Optional reason for this decision"
                      className="mt-1 w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
                    />
                  </label>

                  <div className="mt-auto flex flex-wrap gap-2">
                    {ACTIONS.map((btn) => (
                      <button
                        key={btn.action}
                        type="button"
                        disabled={busy}
                        onClick={() => void submitAction(item.id, btn.action)}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50",
                          btn.className,
                        )}
                      >
                        {pendingId === item.id ? "Saving…" : btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
