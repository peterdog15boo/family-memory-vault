"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2, Star } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { MediaThumb } from "@/components/memories/MediaThumb";
import { userFacingApiError } from "@/lib/http/user-messages";
import type { SafeMediaItem } from "@/lib/media/queries";
import { cn } from "@/lib/utils";

type CreateMemoryFormProps = {
  library: SafeMediaItem[];
  /** Prefill title (e.g. from a person). */
  initialTitle?: string;
  /** Prefill selected media ids that exist in library. */
  initialMediaIds?: string[];
  /** Prefill cover; must be in initialMediaIds / library. */
  initialCoverMediaId?: string | null;
  /** Optional note shown above the picker. */
  sourceHint?: string | null;
};

export function CreateMemoryForm({
  library,
  initialTitle = "",
  initialMediaIds = [],
  initialCoverMediaId = null,
  sourceHint = null,
}: CreateMemoryFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const libraryIds = useMemo(() => new Set(library.map((item) => item.id)), [library]);

  const seededIds = useMemo(
    () => initialMediaIds.filter((id) => libraryIds.has(id)),
    [initialMediaIds, libraryIds],
  );

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>(seededIds);
  const [coverMediaId, setCoverMediaId] = useState<string | null>(() => {
    if (initialCoverMediaId && seededIds.includes(initialCoverMediaId)) {
      return initialCoverMediaId;
    }
    return seededIds[0] ?? null;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleMedia(id: string) {
    setError(null);
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        setCoverMediaId((cover) => (cover === id ? next[0] ?? null : cover));
        return next;
      }
      const next = [...prev, id];
      setCoverMediaId((cover) => cover ?? id);
      return next;
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("memories.errorTitleRequired"));
      return;
    }
    if (selectedIds.length === 0) {
      setError(t("memories.errorSelectMedia"));
      return;
    }

    const cover = coverMediaId && selectedSet.has(coverMediaId)
      ? coverMediaId
      : selectedIds[0];

    startTransition(async () => {
      try {
        const response = await fetch("/api/memories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmed,
            description: description.trim() || null,
            type: "album",
            coverMediaId: cover,
            mediaIds: selectedIds,
          }),
        });

        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          memory?: { id: string };
        };

        if (!response.ok || !data.memory?.id) {
          setError(
            userFacingApiError(data, t("memories.errorCreate")),
          );
          return;
        }

        router.push(`/memories/${data.memory.id}`);
        router.refresh();
      } catch {
        setError(t("memories.errorCreateNetwork"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-ink">
            {t("memories.fieldTitle")}
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
            placeholder={t("memories.titlePlaceholder")}
            className="mt-1.5 w-full rounded-md border border-ink/12 bg-canvas px-3 py-2.5 text-ink outline-none transition placeholder:text-ink/35 focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink">
            {t("memories.fieldDescription")}{" "}
            <span className="font-normal text-ink-muted">
              ({t("common.optional")})
            </span>
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={5000}
            rows={3}
            placeholder={t("memories.descriptionPlaceholder")}
            className="mt-1.5 w-full resize-y rounded-md border border-ink/12 bg-canvas px-3 py-2.5 text-ink outline-none transition placeholder:text-ink/35 focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
          />
        </label>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl tracking-tight text-ink">
              {t("memories.choosePhotos")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {sourceHint ?? t("memories.choosePhotosHint")}
            </p>
          </div>
          <p className="text-xs text-ink-muted">
            {selectedIds.length === 0
              ? t("memories.noneSelected")
              : t("memories.selectedCount", { count: selectedIds.length })}
          </p>
        </div>

        {library.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-ink/15 bg-canvas-deep/50 px-5 py-12 text-center">
            <ImagePlus className="mx-auto size-8 text-ink/30" aria-hidden />
            <p className="mt-3 text-sm text-ink-muted">
              {t("memories.noPhotosReadyBody")}
            </p>
            <Link
              href="/upload"
              className="ui-btn ui-btn-primary mt-4 inline-flex"
            >
              {t("memories.uploadPhotos")}
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {library.map((item) => {
              const selected = selectedSet.has(item.id);
              const isCover = coverMediaId === item.id;

              return (
                <li key={item.id}>
                  <div
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-lg border bg-canvas-deep transition",
                      selected
                        ? "border-accent ring-2 ring-accent/35"
                        : "border-ink/10 hover:border-accent/35",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleMedia(item.id)}
                      aria-pressed={selected}
                      className="absolute inset-0 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                    >
                      <MediaThumb item={item} />
                      <span
                        className={cn(
                          "absolute right-2 top-2 z-[1] flex size-6 items-center justify-center rounded-full border text-xs transition",
                          selected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-ink/20 bg-canvas/80 text-transparent",
                        )}
                        aria-hidden
                      >
                        <Check className="size-3.5" />
                      </span>
                    </button>

                    {selected ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCoverMediaId(item.id);
                        }}
                        className={cn(
                          "absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm transition",
                          isCover
                            ? "bg-accent text-accent-foreground"
                            : "bg-canvas/90 text-ink-muted hover:bg-canvas hover:text-ink",
                        )}
                        aria-label={
                          isCover
                            ? t("memories.currentCover")
                            : t("memories.setCoverImage")
                        }
                      >
                        <Star
                          className={cn("size-3", isCover && "fill-current")}
                          aria-hidden
                        />
                        {t("memories.cover")}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-ink/8 pt-6">
        <button
          type="submit"
          disabled={pending || library.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {pending ? t("common.saving") : t("memories.saveMemory")}
        </button>
        <Link
          href="/memories"
          className="text-sm text-ink-muted transition hover:text-ink"
        >
          {t("common.cancel")}
        </Link>
      </div>
    </form>
  );
}
