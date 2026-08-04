"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent } from "react";
import { Check, Loader2, RotateCcw, ScanFace } from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import {
  AVATAR_ZOOM_MAX,
  AVATAR_ZOOM_MIN,
  clamp01,
  clampZoom,
  framingFromFaceBox,
  hasManualAvatarFraming,
  resolveAvatarFraming,
  type AvatarFraming,
  type StoredAvatarFraming,
} from "@/lib/people/avatar-framing";
import type { FaceBoundingBox } from "@/lib/people/types";
import { cn } from "@/lib/utils";

type AvatarFramingEditorProps = {
  personId: string;
  displayName: string;
  previewUrl: string | null;
  boundingBox: FaceBoundingBox | null;
  stored: StoredAvatarFraming;
  onSaved: (next: StoredAvatarFraming) => void;
  onError: (message: string) => void;
  className?: string;
};

export function AvatarFramingEditor({
  personId,
  displayName,
  previewUrl,
  boundingBox,
  stored,
  onSaved,
  onError,
  className,
}: AvatarFramingEditorProps) {
  const auto = framingFromFaceBox(boundingBox);
  const [draft, setDraft] = useState<AvatarFraming>(() =>
    resolveAvatarFraming(stored, boundingBox),
  );
  const [pending, startTransition] = useTransition();
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originFocusX: number;
    originFocusY: number;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(resolveAvatarFraming(stored, boundingBox));
  }, [
    stored.avatarFocusX,
    stored.avatarFocusY,
    stored.avatarZoom,
    boundingBox?.x,
    boundingBox?.y,
    boundingBox?.width,
    boundingBox?.height,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  const effective = resolveAvatarFraming(stored, boundingBox);
  const isDirty =
    Math.abs(draft.focusX - effective.focusX) > 0.001 ||
    Math.abs(draft.focusY - effective.focusY) > 0.001 ||
    Math.abs(draft.zoom - effective.zoom) > 0.01;

  const matchesAuto =
    Math.abs(draft.focusX - auto.focusX) < 0.001 &&
    Math.abs(draft.focusY - auto.focusY) < 0.001 &&
    Math.abs(draft.zoom - auto.zoom) < 0.01;

  function save(next: AvatarFraming | null) {
    startTransition(async () => {
      try {
        const body =
          next === null
            ? {
                avatarFocusX: null,
                avatarFocusY: null,
                avatarZoom: null,
              }
            : {
                avatarFocusX: next.focusX,
                avatarFocusY: next.focusY,
                avatarZoom: next.zoom,
              };
        const response = await fetch(`/api/people/${personId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          person?: StoredAvatarFraming & { id: string };
        };
        if (!response.ok || !data.person) {
          throw new Error(data.error || "Could not save framing.");
        }
        onSaved({
          avatarFocusX: data.person.avatarFocusX ?? null,
          avatarFocusY: data.person.avatarFocusY ?? null,
          avatarZoom: data.person.avatarZoom ?? null,
        });
      } catch (err) {
        onError(err instanceof Error ? err.message : "Could not save framing.");
      }
    });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!previewUrl || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originFocusX: draft.focusX,
      originFocusY: draft.focusY,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Dragging the image: move focus opposite the pointer delta.
    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    const sensitivity = 1 / Math.max(draft.zoom, 1);
    setDraft((prev) => ({
      ...prev,
      focusX: clamp01(drag.originFocusX - dx * sensitivity),
      focusY: clamp01(drag.originFocusY - dy * sensitivity),
    }));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  if (!previewUrl) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-ink/10 bg-canvas-deep/30 px-4 py-4 sm:px-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg text-ink">Avatar framing</p>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
            Drag the preview to re-center, then adjust zoom. Framing is saved
            for the People list and this page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || (matchesAuto && !hasManualAvatarFraming(stored))}
            onClick={() => {
              setDraft(auto);
              save(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-canvas-deep disabled:opacity-50"
          >
            <RotateCcw className="size-3" aria-hidden />
            Auto face
          </button>
          <button
            type="button"
            disabled={pending || !isDirty}
            onClick={() => save(matchesAuto ? null : draft)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <Check className="size-3" aria-hidden />
            )}
            Save framing
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div
          ref={frameRef}
          className="relative cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="presentation"
          title="Drag to re-center"
        >
          <PersonAvatar
            previewUrl={previewUrl}
            boundingBox={boundingBox}
            framingOverride={draft}
            alt={`Adjust avatar for ${displayName}`}
            shape="circle"
            className="size-36 shadow-[0_14px_32px_-20px_rgba(42,40,37,0.5)] sm:size-40"
          />
          <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-accent/35" />
        </div>

        <div className="w-full min-w-0 flex-1 space-y-4">
          <label className="block text-sm text-ink">
            <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <ScanFace className="size-3.5" aria-hidden />
                Zoom
              </span>
              <span className="tabular-nums">{draft.zoom.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              min={AVATAR_ZOOM_MIN}
              max={AVATAR_ZOOM_MAX}
              step={0.05}
              value={draft.zoom}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  zoom: clampZoom(Number(e.target.value)),
                }))
              }
              className="w-full accent-[var(--accent)]"
            />
          </label>
          <p className="text-xs leading-relaxed text-ink-muted">
            Tip: set the cover photo first (star on a photo), then fine-tune
            center and zoom here.
          </p>
        </div>
      </div>
    </div>
  );
}
