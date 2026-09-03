"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { Search, Tags, X } from "lucide-react";
import { MediaGallery } from "@/components/dashboard/MediaGallery";
import { LibrarySection } from "@/components/library/LibrarySection";
import { MediaTagModeDock } from "@/components/media/MediaTagModeDock";
import { useCopy, useTranslations } from "@/components/i18n/LocaleProvider";
import { announce } from "@/lib/a11y/announce";
import type { SerializedSafeMedia } from "@/lib/memories/types";
import { cn } from "@/lib/utils";

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
  label,
}: {
  onClick: () => void;
  pending: boolean;
  label?: string;
}) {
  const t = useTranslations();
  return (
    <div className="mt-6 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-md border border-ink/15 bg-canvas px-4 py-2 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-canvas-deep disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? t("common.loading") : (label ?? t("common.loadMore"))}
      </button>
    </div>
  );
}

/** Prefer the first tile intersecting the viewport; else the first id. */
function pickFirstVisibleMediaId(ids: string[]): string | null {
  if (ids.length === 0) return null;
  for (const id of ids) {
    const el = document.querySelector<HTMLElement>(`[data-media-id="${id}"]`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const top = 72;
    const bottom = window.innerHeight - 120;
    if (rect.bottom > top && rect.top < bottom) {
      return id;
    }
  }
  return ids[0] ?? null;
}

function scrollMediaTileIntoView(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-media-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "nearest",
  });
}

function libraryUrl(
  scope: "own" | "shared",
  offset: number,
  limit: number,
  q: string,
) {
  const params = new URLSearchParams({
    scope,
    offset: String(offset),
    limit: String(limit),
  });
  if (q.length >= 2) params.set("q", q);
  return `/api/media/library?${params.toString()}`;
}

/**
 * Media library sections with client-side load-more (offset pagination),
 * tag/keyword search (AI + user tags), and Photos tag mode.
 */
export function PaginatedMediaLibrary({
  initialOwn,
  initialShared,
  hasFamilySharing,
  ownHasMore: initialOwnHasMore,
  sharedHasMore: initialSharedHasMore,
  pageSize = 48,
}: PaginatedMediaLibraryProps) {
  const copy = useCopy();
  const t = useTranslations();
  const [own, setOwn] = useState(initialOwn);
  const [shared, setShared] = useState(initialShared);
  const [ownHasMore, setOwnHasMore] = useState(initialOwnHasMore);
  const [sharedHasMore, setSharedHasMore] = useState(initialSharedHasMore);
  const [ownPending, startOwn] = useTransition();
  const [sharedPending, startShared] = useTransition();
  const [searchPending, startSearch] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tagMode, setTagMode] = useState(false);
  const [tagActiveId, setTagActiveId] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("scope") !== "shared") {
      return;
    }
    const target = document.getElementById("media-shared");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasFamilySharing, shared.length]);

  // Debounce draft → applied query (min 2 chars, matching API).
  useEffect(() => {
    const trimmed = searchDraft.trim();
    const next = trimmed.length >= 2 ? trimmed : "";
    const handle = window.setTimeout(() => setSearchQuery(next), 280);
    return () => window.clearTimeout(handle);
  }, [searchDraft]);

  // Refetch both scopes whenever the applied search query changes.
  useEffect(() => {
    let cancelled = false;
    startSearch(async () => {
      setError(null);
      if (!searchQuery) {
        if (cancelled) return;
        setOwn(initialOwn);
        setShared(initialShared);
        setOwnHasMore(initialOwnHasMore);
        setSharedHasMore(initialSharedHasMore);
        return;
      }
      try {
        const [ownRes, sharedRes] = await Promise.all([
          fetch(libraryUrl("own", 0, pageSize, searchQuery)),
          hasFamilySharing || initialShared.length > 0
            ? fetch(libraryUrl("shared", 0, pageSize, searchQuery))
            : Promise.resolve(null),
        ]);
        if (!ownRes.ok) throw new Error("Could not search photos.");
        const ownData = (await ownRes.json()) as {
          items: SerializedSafeMedia[];
          hasMore: boolean;
        };
        let sharedData: { items: SerializedSafeMedia[]; hasMore: boolean } = {
          items: [],
          hasMore: false,
        };
        if (sharedRes) {
          if (!sharedRes.ok) throw new Error("Could not search photos.");
          sharedData = (await sharedRes.json()) as typeof sharedData;
        }
        if (cancelled) return;
        setOwn(ownData.items);
        setOwnHasMore(ownData.hasMore);
        setShared(sharedData.items);
        setSharedHasMore(sharedData.hasMore);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not search photos.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
    // initial* intentionally from first render — clearing search restores SSR page.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset to SSR snapshot only
  }, [searchQuery, pageSize, hasFamilySharing]);

  const allItems = useMemo(() => [...own, ...shared], [own, shared]);
  const allIds = useMemo(() => allItems.map((item) => item.id), [allItems]);
  const tagIndex = tagActiveId ? allIds.indexOf(tagActiveId) : -1;
  const tagActive =
    tagIndex >= 0 ? (allItems[tagIndex] ?? null) : null;

  const selectTagMedia = useCallback(
    (id: string) => {
      setTagActiveId(id);
      requestAnimationFrame(() => scrollMediaTileIntoView(id));
      const index = allIds.indexOf(id);
      if (index >= 0) {
        announce(
          t("a11y.tagModePhoto", {
            index: index + 1,
            count: allIds.length,
          }),
          { priority: "polite" },
        );
      }
    },
    [allIds, t],
  );

  const exitTagMode = useCallback(() => {
    setTagMode(false);
    setTagActiveId(null);
    announce(t("a11y.tagModeExited"), { priority: "polite" });
  }, [t]);

  const enterTagMode = useCallback(() => {
    if (allIds.length === 0) return;
    setTagMode(true);
    const startId = pickFirstVisibleMediaId(allIds) ?? allIds[0]!;
    setTagActiveId(startId);
    requestAnimationFrame(() => scrollMediaTileIntoView(startId));
    const index = allIds.indexOf(startId);
    announce(
      t("a11y.tagModeEntered", {
        index: (index >= 0 ? index : 0) + 1,
        count: allIds.length,
      }),
      { priority: "polite" },
    );
  }, [allIds, t]);

  const goTagRelative = useCallback(
    (delta: number) => {
      if (allIds.length === 0) return;
      const current = tagActiveId ? allIds.indexOf(tagActiveId) : 0;
      const base = current >= 0 ? current : 0;
      const next =
        (base + delta + allIds.length * 100) % allIds.length;
      const id = allIds[next]!;
      selectTagMedia(id);
    },
    [allIds, tagActiveId, selectTagMedia],
  );

  const goTagPrev = useCallback(() => goTagRelative(-1), [goTagRelative]);
  const goTagNext = useCallback(() => goTagRelative(1), [goTagRelative]);

  useEffect(() => {
    if (!tagMode) return;
    if (allIds.length === 0) {
      exitTagMode();
      return;
    }
    if (!tagActiveId || !allIds.includes(tagActiveId)) {
      setTagActiveId(allIds[0] ?? null);
    }
  }, [tagMode, allIds, tagActiveId, exitTagMode]);

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
            libraryUrl(scope, offset, pageSize, searchQuery),
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
    [own.length, shared.length, pageSize, searchQuery, startOwn, startShared],
  );

  const clearSearch = useCallback(() => {
    setSearchDraft("");
    setSearchQuery("");
  }, []);

  const total = own.length + shared.length;
  const hasBaselineMedia =
    initialOwn.length > 0 || initialShared.length > 0;
  const tagModeProps = tagMode
    ? { activeId: tagActiveId, onSelect: selectTagMedia }
    : null;
  const searching = Boolean(searchQuery);

  return (
    <>
      <div
        className={cn(
          "mt-3 flex flex-col gap-3",
          tagMode && "pb-[min(55vh,28rem)]",
        )}
      >
        {hasBaselineMedia ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block min-w-0 flex-1 sm:max-w-md">
              <span className="sr-only">{t("mediaUi.searchPlaceholder")}</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
                aria-hidden
              />
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder={t("mediaUi.searchPlaceholder")}
                className="ui-input w-full pl-9 pr-9 text-sm"
                autoComplete="off"
              />
              {searchDraft ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:bg-ink/5 hover:text-ink"
                  aria-label={t("mediaUi.searchClear")}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              onClick={() => (tagMode ? exitTagMode() : enterTagMode())}
              disabled={total === 0 && !tagMode}
              className={cn(
                "ui-btn ui-btn-sm inline-flex shrink-0 items-center gap-1.5",
                tagMode ? "ui-btn-primary" : "ui-btn-secondary",
              )}
              aria-pressed={tagMode}
            >
              <Tags className="size-3.5" aria-hidden />
              {tagMode ? t("mediaUi.tagModeExit") : t("mediaUi.tagModeEnter")}
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {searchPending ? (
            <p className="text-sm text-ink-muted" role="status">
              {t("mediaUi.searchSearching")}
            </p>
          ) : total > 0 ? (
            <p className="text-sm text-ink-muted">
              Showing {total} item{total === 1 ? "" : "s"}
              {searching ? ` for “${searchQuery}”` : ""}
              {!searching && (ownHasMore || sharedHasMore)
                ? " (more available)"
                : ""}
              {searching && (ownHasMore || sharedHasMore)
                ? " (more available)"
                : ""}
            </p>
          ) : searching ? (
            <p className="text-sm text-ink-muted" role="status">
              {t("mediaUi.searchNoResults", { query: searchQuery })}
            </p>
          ) : (
            <span />
          )}
        </div>
      </div>

      {tagMode ? (
        <p className="mt-2 text-sm text-ink-muted" role="status">
          {t("mediaUi.tagModeBanner")}
        </p>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <LibrarySection
        title={t("pages.mediaTitle")}
        description={t("pages.mediaDescription")}
        count={own.length}
        className="mt-10"
      >
        <MediaGallery
          items={own}
          onDelete={handleDeleteOwn}
          deletingId={deletingId}
          tagMode={tagModeProps}
          emptyTitle={
            searching ? t("mediaUi.searchNoResults", { query: searchQuery }) : undefined
          }
          emptyDescription={
            searching
              ? t("mediaUi.tagsYoursEmptyEditable")
              : undefined
          }
          emptyActionHref={searching ? null : undefined}
          emptySecondaryAction={
            searching
              ? null
              : {
                  href: "/family-memory-box",
                  label: t("pages.digitizeOld"),
                }
          }
        />
        {ownHasMore ? (
          <LoadMoreButton
            onClick={() => loadMore("own")}
            pending={ownPending}
          />
        ) : null}
      </LibrarySection>

      {hasFamilySharing || shared.length > 0 || (searching && hasFamilySharing) ? (
        <LibrarySection
          id="media-shared"
          title={t("mediaUi.sharedSectionTitle")}
          description={t("mediaUi.sharedSectionLead")}
          count={shared.length}
          variant="shared"
          className="mt-12"
        >
          <MediaGallery
            items={shared}
            tagMode={tagModeProps}
            emptyTitle={
              searching
                ? t("mediaUi.searchNoResults", { query: searchQuery })
                : copy.empty.mediaShared.title
            }
            emptyDescription={
              searching
                ? t("mediaUi.tagsYoursEmptyEditable")
                : copy.empty.mediaShared.description
            }
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

      {tagMode && tagActive ? (
        <MediaTagModeDock
          active={tagActive}
          index={Math.max(0, tagIndex)}
          count={allIds.length}
          onPrev={goTagPrev}
          onNext={goTagNext}
          onExit={exitTagMode}
        />
      ) : null}
    </>
  );
}
