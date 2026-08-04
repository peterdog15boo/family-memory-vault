"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import { MediaThumb } from "@/components/memories/MediaThumb";
import type { SerializedSafeMedia } from "@/lib/people/queries";
import { cn } from "@/lib/utils";

type AddPhotosToPersonSheetProps = {
  personId: string;
  personName: string;
  /** Media already linked to this person — excluded from the picker. */
  excludeMediaIds: string[];
  open: boolean;
  onClose: () => void;
  onAssigned: (payload: {
    person: unknown;
    assignedCount: number;
    alreadyCount: number;
    skippedCount: number;
  }) => void;
};

/**
 * Multi-select clean/ready photo + video picker that POSTs to
 * /api/people/[id]/photos (creates a manual face link when detection missed).
 */
export function AddPhotosToPersonSheet({
  personId,
  personName,
  excludeMediaIds,
  open,
  onClose,
  onAssigned,
}: AddPhotosToPersonSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [library, setLibrary] = useState<SerializedSafeMedia[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const exclude = useMemo(() => new Set(excludeMediaIds), [excludeMediaIds]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/media/library?scope=own&limit=96");
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: SerializedSafeMedia[];
        own?: SerializedSafeMedia[];
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not load your library.");
      }
      const rows = data.items ?? data.own ?? [];
      setLibrary(
        rows.filter((item) => item.type === "photo" || item.type === "video"),
      );
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load your library.",
      );
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setPickedIds([]);
    setSaveError(null);
    void loadLibrary();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, loadLibrary]);

  const addable = useMemo(
    () => library.filter((item) => !exclude.has(item.id)),
    [library, exclude],
  );

  function toggle(id: string) {
    setPickedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit() {
    if (pickedIds.length === 0) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/people/${personId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds: pickedIds }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          person?: unknown;
          assigned?: string[];
          alreadyAssigned?: string[];
          skipped?: { mediaId: string; reason: string }[];
        };
        if (!res.ok || !data.person) {
          throw new Error(data.error || "Could not add photos or videos.");
        }
        onAssigned({
          person: data.person,
          assignedCount: data.assigned?.length ?? 0,
          alreadyCount: data.alreadyAssigned?.length ?? 0,
          skippedCount: data.skipped?.length ?? 0,
        });
        onClose();
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : "Could not add photos or videos.",
        );
      }
    });
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Add photos or videos to ${personName}`}
      onClick={() => !pending && onClose()}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink/10 bg-canvas shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/8 px-4 py-3">
          <div>
            <h3 className="font-display text-lg text-ink">
              Add photos / videos
            </h3>
            <p className="text-xs text-ink-muted">
              Choose clean, ready photos or videos to attach to {personName}.
              Works even when face detection missed them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-2 text-ink-muted hover:bg-ink/5 hover:text-ink disabled:opacity-50"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loadingLibrary ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-ink-muted" />
            </div>
          ) : loadError ? (
            <p className="py-10 text-center text-sm text-red-800">{loadError}</p>
          ) : addable.length === 0 ? (
            <div className="py-10 text-center">
              <ImagePlus className="mx-auto size-8 text-ink/25" aria-hidden />
              <p className="mt-3 text-sm text-ink-muted">
                No more ready photos or videos to add.{" "}
                <Link href="/upload" className="text-accent-deep underline">
                  Upload more
                </Link>
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {addable.map((item) => {
                const selected = pickedIds.includes(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      aria-pressed={selected}
                      aria-label={`${selected ? "Deselect" : "Select"} ${
                        item.type === "video" ? "video" : "photo"
                      } ${item.originalFilename || item.id}`}
                      className={cn(
                        "relative aspect-square w-full overflow-hidden rounded-lg border",
                        selected
                          ? "border-accent ring-2 ring-accent/35"
                          : "border-ink/10",
                      )}
                    >
                      <MediaThumb item={item} />
                      <span
                        className={cn(
                          "absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border",
                          selected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-ink/20 bg-canvas/80 text-transparent",
                        )}
                      >
                        <Check className="size-3" aria-hidden />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/8 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">
              {pickedIds.length} selected
            </p>
            {saveError ? (
              <p className="mt-0.5 truncate text-xs text-red-800">{saveError}</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={pending || pickedIds.length === 0}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-3.5" aria-hidden />
            )}
            Add to {personName}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
