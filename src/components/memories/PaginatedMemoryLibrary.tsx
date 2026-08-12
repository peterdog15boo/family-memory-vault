"use client";

import { useCallback, useState, useTransition } from "react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { LibrarySection } from "@/components/library/LibrarySection";
import { MemoryList } from "@/components/memories/MemoryList";
import type { SerializedMemoryListItem } from "@/lib/memories/types";

type PaginatedMemoryLibraryProps = {
  initialOwn: SerializedMemoryListItem[];
  initialShared: SerializedMemoryListItem[];
  hasFamilySharing: boolean;
  ownHasMore: boolean;
  sharedHasMore: boolean;
  pageSize?: number;
  /** Shown after redirect from detail delete (?deleted=1). */
  initialNotice?: string | null;
};

function LoadMoreButton({
  onClick,
  pending,
  loadingLabel,
  loadMoreLabel,
}: {
  onClick: () => void;
  pending: boolean;
  loadingLabel: string;
  loadMoreLabel: string;
}) {
  return (
    <div className="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-ink/15 bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-canvas-deep disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? loadingLabel : loadMoreLabel}
      </button>
    </div>
  );
}

export function PaginatedMemoryLibrary({
  initialOwn,
  initialShared,
  hasFamilySharing,
  ownHasMore: initialOwnHasMore,
  sharedHasMore: initialSharedHasMore,
  pageSize = 48,
  initialNotice = null,
}: PaginatedMemoryLibraryProps) {
  const t = useTranslations();
  const [own, setOwn] = useState(initialOwn);
  const [shared, setShared] = useState(initialShared);
  const [ownHasMore, setOwnHasMore] = useState(initialOwnHasMore);
  const [sharedHasMore, setSharedHasMore] = useState(initialSharedHasMore);
  const [ownPending, startOwn] = useTransition();
  const [sharedPending, startShared] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice);

  const loadMore = useCallback(
    (scope: "own" | "shared") => {
      const run = scope === "own" ? startOwn : startShared;
      run(async () => {
        setError(null);
        const offset = scope === "own" ? own.length : shared.length;
        try {
          const res = await fetch(
            `/api/memories/library?scope=${scope}&offset=${offset}&limit=${pageSize}`,
          );
          if (!res.ok) throw new Error("Could not load more memories.");
          const data = (await res.json()) as {
            items: SerializedMemoryListItem[];
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
            err instanceof Error
              ? err.message
              : "Could not load more memories.",
          );
        }
      });
    },
    [own.length, shared.length, pageSize, startOwn, startShared],
  );

  function handleOwnDeleted(memoryId: string) {
    setOwn((prev) => prev.filter((m) => m.id !== memoryId));
    setNotice(t("memories.deletedNotice"));
    setError(null);
  }

  return (
    <>
      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          className="mt-4 rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent-deep"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <LibrarySection
        title={t("memories.yourAlbums")}
        description={t("dashboard.recentMemoriesLead")}
        count={own.length}
        className="mt-10"
      >
        <MemoryList
          memories={own}
          emptyVariant="first"
          showActions
          onDeleted={handleOwnDeleted}
        />
        {ownHasMore ? (
          <LoadMoreButton
            onClick={() => loadMore("own")}
            pending={ownPending}
            loadingLabel={t("common.loading")}
            loadMoreLabel={t("common.loadMore")}
          />
        ) : null}
      </LibrarySection>

      {hasFamilySharing || shared.length > 0 ? (
        <LibrarySection
          title={t("memories.sharedAlbums")}
          description={t("memories.sharedAlbumsLead")}
          count={shared.length}
          variant="shared"
          className="mt-12"
        >
          <MemoryList memories={shared} emptyVariant="shared" showActions />
          {sharedHasMore ? (
            <LoadMoreButton
              onClick={() => loadMore("shared")}
              pending={sharedPending}
              loadingLabel={t("common.loading")}
              loadMoreLabel={t("common.loadMore")}
            />
          ) : null}
        </LibrarySection>
      ) : null}
    </>
  );
}
