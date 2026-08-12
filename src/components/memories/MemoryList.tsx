"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { Images, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaThumb } from "@/components/memories/MediaThumb";
import { useCopy, useFormat, useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import type {
  MemoryListItem,
  SerializedMemoryListItem,
} from "@/lib/memories/types";
import { cn } from "@/lib/utils";

type MemoryListRow = MemoryListItem | SerializedMemoryListItem;

type MemoryListProps = {
  memories: MemoryListRow[];
  /** Stronger first-time empty copy for the dedicated memories page. */
  emptyVariant?: "default" | "first" | "shared";
  /** Show Open / Edit / Delete actions under each card. Edit/Delete only for owned. */
  showActions?: boolean;
  /** Called after a successful owner delete so the parent can drop the card. */
  onDeleted?: (memoryId: string) => void;
  className?: string;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function MemoryList({
  memories,
  emptyVariant = "default",
  showActions = true,
  onDeleted,
  className,
}: MemoryListProps) {
  const router = useRouter();
  const copy = useCopy();
  const t = useTranslations();
  const format = useFormat();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function formatCreatedDate(value: Date | string) {
    return format.date(asDate(value));
  }

  function confirmDelete(memory: MemoryListRow) {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/memories/${memory.id}`, {
          method: "DELETE",
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          ok?: boolean;
        };
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Could not delete album.");
        }
        setConfirmId(null);
        if (onDeleted) {
          onDeleted(memory.id);
        } else {
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed.");
      }
    });
  }

  if (memories.length === 0) {
    const emptyCopy =
      emptyVariant === "first"
        ? copy.empty.memoriesFirst
        : emptyVariant === "shared"
          ? copy.empty.memoriesShared
          : copy.empty.memoriesDefault;

    return (
      <EmptyState
        icon={Images}
        title={emptyCopy.title}
        description={emptyCopy.description}
        action={
          emptyVariant !== "shared"
            ? {
                href: "/memories/new",
                label: t("pages.createMemory"),
                icon: Plus,
              }
            : undefined
        }
        secondaryAction={
          emptyVariant === "shared"
            ? { href: "/family", label: t("pages.manageFamily") }
            : emptyVariant === "first"
              ? { href: "/upload", label: t("pages.uploadPhotosFirst") }
              : undefined
        }
        className={className}
        size="large"
      />
    );
  }

  const confirming = memories.find((m) => m.id === confirmId) ?? null;
  const confirmRef = useRef<HTMLDivElement>(null);
  const dismissConfirm = useCallback(() => {
    if (pending) return;
    setConfirmId(null);
    setError(null);
  }, [pending]);

  useOverlayA11y({
    open: Boolean(confirming),
    onClose: dismissConfirm,
    containerRef: confirmRef,
    lockScroll: false,
    // Inline non-modal confirm — Escape + initial focus only; don't trap Tab.
    trapFocus: false,
    initialFocusSelector: "button",
  });

  return (
    <div className={className}>
      {error ? (
        <p
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div
          ref={confirmRef}
          className="mb-5 rounded-xl border border-red-200 bg-red-50/60 px-4 py-4 sm:px-5"
          role="dialog"
          aria-modal="false"
          aria-labelledby={`delete-album-${confirming.id}`}
          tabIndex={-1}
        >
          <p
            id={`delete-album-${confirming.id}`}
            className="font-display text-lg text-ink"
          >
            Delete this album?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Removes{" "}
            <span className="font-medium text-ink">{confirming.title}</span> from
            Memories. Your photos stay saved — this only deletes the album and
            any movies made from it. This can&apos;t be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => confirmDelete(confirming)}
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
              Delete album
            </button>
            <button
              type="button"
              onClick={dismissConfirm}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-canvas px-4 py-2.5 text-sm text-ink hover:bg-canvas-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ul className="memory-list-grid grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {memories.map((memory) => {
          const created = asDate(memory.createdAt);
          return (
            <li key={memory.id} className="flex flex-col">
              <Link
                href={`/memories/${memory.id}`}
                className="list-card group flex flex-1 flex-col overflow-hidden rounded-xl border border-ink/10 bg-canvas transition hover:border-accent/35 hover:shadow-sm"
              >
                <div className="memory-card-cover relative aspect-[16/10] bg-canvas-deep">
                  {memory.cover ? (
                    <MediaThumb item={memory.cover} />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-ink/25">
                      <Images className="size-8" aria-hidden />
                      <span className="text-xs text-ink/40">No cover</span>
                    </div>
                  )}
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/45 to-transparent px-3 pb-2.5 pt-8 text-[11px] font-medium text-accent-foreground opacity-0 transition group-hover:opacity-100">
                    Open memory
                  </span>
                </div>
                <div className="flex flex-1 flex-col px-4 py-3.5">
                  <h3 className="font-display text-lg tracking-tight text-ink transition group-hover:text-accent-deep">
                    {memory.title}
                  </h3>
                  {memory.description ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                      {memory.description}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-xs text-ink-muted">
                    <span>
                      {memory.mediaCount} item
                      {memory.mediaCount === 1 ? "" : "s"}
                    </span>
                    <span aria-hidden>·</span>
                    <time dateTime={created.toISOString()}>
                      {formatCreatedDate(created)}
                    </time>
                    {memory.isOwned && memory.sharedWithFamily ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1 text-accent-deep">
                          <Users className="size-3" aria-hidden />
                          Shared
                        </span>
                      </>
                    ) : null}
                    {!memory.isOwned ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1 text-accent-deep">
                          <Users className="size-3" aria-hidden />
                          Family
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </Link>

              {showActions ? (
                <div className="mt-2 flex gap-2 px-0.5">
                  <Link
                    href={`/memories/${memory.id}`}
                    className="inline-flex flex-1 items-center justify-center rounded-md border border-ink/10 bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/35 hover:bg-canvas-deep"
                  >
                    Open
                  </Link>
                  {memory.isOwned ? (
                    <>
                      <Link
                        href={`/memories/${memory.id}?edit=1`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent/35 hover:bg-canvas-deep"
                      >
                        <Pencil className="size-3" aria-hidden />
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setConfirmId(memory.id);
                        }}
                        className={cn(
                          "inline-flex items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition",
                          confirmId === memory.id
                            ? "border-red-300 bg-red-50 text-red-800"
                            : "border-ink/10 bg-canvas text-ink hover:border-red-200 hover:bg-red-50/80 hover:text-red-800",
                        )}
                        aria-label={`Delete ${memory.title}`}
                      >
                        <Trash2 className="size-3" aria-hidden />
                        Delete
                      </button>
                    </>
                  ) : (
                    <span className="inline-flex flex-1 items-center justify-center rounded-md border border-transparent px-3 py-1.5 text-xs text-ink-muted">
                      Shared
                    </span>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
