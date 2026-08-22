"use client";

import { useTransition } from "react";
import { Loader2, Users } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  MEMORY_FAMILY_ACCESS_LEVELS,
  type MemoryFamilyAccess,
  type SerializedMemoryWithMedia,
} from "@/lib/memories/types";
import { cn } from "@/lib/utils";

type MemoryFamilyShareControlsProps = {
  memory: SerializedMemoryWithMedia;
  /** Owner-only. */
  canManage: boolean;
  /** Viewer has at least one active family. */
  hasFamily: boolean;
  onUpdated: (memory: SerializedMemoryWithMedia) => void;
  onError: (message: string | null) => void;
  className?: string;
};

/**
 * Share-with-family toggle + view/contribute access for memory owners.
 */
export function MemoryFamilyShareControls({
  memory,
  canManage,
  hasFamily,
  onUpdated,
  onError,
  className,
}: MemoryFamilyShareControlsProps) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const shared = memory.sharedWithFamily;

  function save(next: {
    sharedWithFamily: boolean;
    familyAccess?: MemoryFamilyAccess;
  }) {
    onError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/memories/${memory.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          memory?: SerializedMemoryWithMedia;
        };
        if (!response.ok || !data.memory) {
          throw new Error(data.error || t("memories.errorUpdateSharing"));
        }
        onUpdated(data.memory);
      } catch (err) {
        onError(
          err instanceof Error
            ? err.message
            : t("memories.errorSharingFailed"),
        );
      }
    });
  }

  if (!canManage) {
    if (!shared) return null;
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-md bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent-deep",
          className,
        )}
      >
        <Users className="size-3.5" aria-hidden />
        {t("memories.sharedWithFamilyBadge")}
        <span className="text-accent-deep/70">
          ·{" "}
          {memory.familyAccess === "contribute"
            ? t("memories.canContribute")
            : t("memories.viewOnly")}
        </span>
      </div>
    );
  }

  if (!hasFamily) {
    return (
      <p
        className={cn(
          "text-xs leading-relaxed text-ink-muted",
          className,
        )}
      >
        <a href="/family" className="font-medium text-accent-deep underline-offset-2 hover:underline">
          {t("memories.createOrJoinFamily")}
        </a>{" "}
        {t("memories.toShareThisMemory")}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-ink/10 bg-canvas/90 p-4",
        shared && "border-accent/30 bg-accent/5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Users
              className={cn(
                "size-4",
                shared ? "text-accent-deep" : "text-ink-muted",
              )}
              aria-hidden
            />
            <p className="text-sm font-medium text-ink">
              {t("memories.shareWithFamily")}
            </p>
            {shared ? (
              <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-deep">
                {t("memories.sharedBadge")}
              </span>
            ) : (
              <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                {t("memories.privateBadge")}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-muted">
            {t("memories.shareHelp")}{" "}
            <a
              href="/family"
              className="font-medium text-accent-deep underline-offset-2 hover:underline"
            >
              {t("family.requestPhotos")}
            </a>
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={shared}
          disabled={pending}
          onClick={() =>
            save({
              sharedWithFamily: !shared,
              familyAccess: memory.familyAccess,
            })
          }
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition",
            shared ? "bg-accent" : "bg-ink/20",
            pending && "opacity-60",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-6 rounded-full bg-canvas shadow transition",
              shared && "translate-x-5",
            )}
          />
          <span className="sr-only">
            {shared
              ? t("memories.stopSharingWithFamily")
              : t("memories.shareWithFamily")}
          </span>
        </button>
      </div>

      {shared ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/8 pt-3">
          <label
            htmlFor={`family-access-${memory.id}`}
            className="text-xs font-medium text-ink-muted"
          >
            {t("memories.familyCan")}
          </label>
          <select
            id={`family-access-${memory.id}`}
            value={memory.familyAccess}
            disabled={pending}
            onChange={(event) =>
              save({
                sharedWithFamily: true,
                familyAccess: event.target.value as MemoryFamilyAccess,
              })
            }
            className="rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
          >
            {MEMORY_FAMILY_ACCESS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level === "view"
                  ? t("memories.viewOnly")
                  : t("memories.viewAndContribute")}
              </option>
            ))}
          </select>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin text-ink-muted" aria-hidden />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
