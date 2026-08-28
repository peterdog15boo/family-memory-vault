"use client";

import Link from "next/link";
import { Loader2, Network } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  familyId: string;
  shared: boolean;
  canManage: boolean;
  pending?: boolean;
  onSharedChange?: (shared: boolean) => void;
  className?: string;
};

/**
 * Owner control: share Family Tree with invited members (view by default).
 */
export function FamilyTreeSharingSettings({
  familyId,
  shared,
  canManage,
  pending = false,
  onSharedChange,
  className,
}: Props) {
  if (!canManage) {
    if (!shared) return null;
    return (
      <div
        className={cn(
          "mt-8 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-ink",
          className,
        )}
      >
        <p className="inline-flex items-center gap-2 font-medium">
          <Network className="size-4 text-accent-deep" aria-hidden />
          Family Tree is shared with this family
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Open{" "}
          <Link
            href={`/family-tree?familyId=${encodeURIComponent(familyId)}`}
            className="font-semibold text-accent-deep underline-offset-2 hover:underline"
          >
            Family Tree
          </Link>{" "}
          to view it. Contribution is controlled by the family owner.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-8 rounded-xl border border-ink/10 bg-canvas/90 p-4",
        shared && "border-accent/30 bg-accent/5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <Network className="size-4 text-accent-deep" aria-hidden />
            Family Tree sharing
          </p>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-muted">
            Share your tree with invited family. New members get{" "}
            <strong className="font-medium text-ink">view only</strong> until you
            allow someone to contribute. Kids can stay view-only.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            className="size-4 rounded border-ink/30"
            checked={shared}
            disabled={pending}
            onChange={(e) => onSharedChange?.(e.target.checked)}
          />
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          Share with family
        </label>
      </div>
      {shared ? (
        <p className="mt-3 text-xs text-ink-muted">
          Use the per-member toggles below for view / contribute. Manage the tree
          in{" "}
          <Link
            href={`/family-tree?familyId=${encodeURIComponent(familyId)}`}
            className="font-semibold text-accent-deep underline-offset-2 hover:underline"
          >
            Family Tree
          </Link>
          . <span className="sr-only">Family {familyId}</span>
        </p>
      ) : null}
    </div>
  );
}
