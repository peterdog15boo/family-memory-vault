"use client";

import { useCallback, useState, useTransition } from "react";
import { MediaGallery } from "@/components/dashboard/MediaGallery";
import { LibrarySection } from "@/components/library/LibrarySection";
import { COPY } from "@/lib/copy";
import type { SerializedSafeMedia } from "@/lib/memories/types";

type PaginatedMediaLibraryProps = {
  initialOwn: SerializedSafeMedia[];
  initialShared: SerializedSafeMedia[];
  hasFamilySharing: boolean;
  ownHasMore: boolean;
  sharedHasMore: boolean;
  pageSize?: number;
};

function LoadMoreButton({
  onClick,
  pending,
  label = "Load more",
}: {
  onClick: () => void;
  pending: boolean;
  label?: string;
}) {
  return (
    <div className="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-ink/15 bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-canvas-deep disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Loading…" : label}
      </button>
    </div>
  );
}

/**
 * Media library sections with client-side load-more (offset pagination).
 */
export function PaginatedMediaLibrary({
  initialOwn,
  initialShared,
  hasFamilySharing,
  ownHasMore: initialOwnHasMore,
  sharedHasMore: initialSharedHasMore,
  pageSize = 48,
}: PaginatedMediaLibraryProps) {
  const [own, setOwn] = useState(initialOwn);
  const [shared, setShared] = useState(initialShared);
  const [ownHasMore, setOwnHasMore] = useState(initialOwnHasMore);
  const [sharedHasMore, setSharedHasMore] = useState(initialSharedHasMore);
  const [ownPending, startOwn] = useTransition();
  const [sharedPending, startShared] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteOwn = useCallback(
    async (item: { id: string; originalFilename?: string | null }) => {
      setDeletingId(item.id);
      setError(null);
      try {
        const res = await fetch(`/api/media/${item.id}`, { method: "DELETE" });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Could not delete this photo.");
        }
        setOwn((prev) => prev.filter((row) => row.id !== item.id));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not delete this photo.",
        );
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  const loadMore = useCallback(
    (scope: "own" | "shared") => {
      const run = scope === "own" ? startOwn : startShared;
      run(async () => {
        setError(null);
        const offset = scope === "own" ? own.length : shared.length;
        try {
          const res = await fetch(
            `/api/media/library?scope=${scope}&offset=${offset}&limit=${pageSize}`,
          );
          if (!res.ok) {
            throw new Error("Could not load more photos.");
          }
          const data = (await res.json()) as {
            items: SerializedSafeMedia[];
            hasMore: boolean;
          };
          if (scope === "own") {
            setOwn((prev) => [...prev, ...data.items]);
            setOwnHasMore(data.hasMore);
          } else {
            setShared((prev) => [...prev, ...data.items]);
            setSharedHasMore(data.hasMore);
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Could not load more photos.",
          );
        }
      });
    },
    [own.length, shared.length, pageSize, startOwn, startShared],
  );

  const total = own.length + shared.length;

  return (
    <>
      {total > 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          Showing {total} item{total === 1 ? "" : "s"}
          {ownHasMore || sharedHasMore ? " (more available)" : ""}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <LibrarySection
        title="Your photos"
        description="Photos and videos you’ve added."
        count={own.length}
        className="mt-10"
      >
        <MediaGallery
          items={own}
          onDelete={handleDeleteOwn}
          deletingId={deletingId}
          emptySecondaryAction={{
            href: "/family-memory-box",
            label: "Or digitize old photos & tapes",
          }}
        />
        {ownHasMore ? (
          <LoadMoreButton
            onClick={() => loadMore("own")}
            pending={ownPending}
          />
        ) : null}
      </LibrarySection>

      {hasFamilySharing || shared.length > 0 ? (
        <LibrarySection
          title="Shared with family"
          description="Photos from people in your family."
          count={shared.length}
          variant="shared"
          className="mt-12"
        >
          <MediaGallery
            items={shared}
            emptyTitle={COPY.empty.mediaShared.title}
            emptyDescription={COPY.empty.mediaShared.description}
            emptyActionHref={null}
            emptySecondaryAction={null}
          />
          {sharedHasMore ? (
            <LoadMoreButton
              onClick={() => loadMore("shared")}
              pending={sharedPending}
            />
          ) : null}
        </LibrarySection>
      ) : null}
    </>
  );
}
