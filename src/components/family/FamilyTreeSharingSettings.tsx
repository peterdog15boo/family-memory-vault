"use client";

import Link from "next/link";
import { Loader2, Lock, Network } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  familyId: string;
  shared: boolean;
  membersCanEdit: boolean;
  canManage: boolean;
  pending?: boolean;
  onSharedChange?: (shared: boolean) => void;
  onMembersCanEditChange?: (membersCanEdit: boolean) => void;
  className?: string;
};

/**
 * Owner controls: shareWithMembers + membersCanEdit (one source of truth).
 * Invite ≠ tree share — these toggles are explicit.
 */
export function FamilyTreeSharingSettings({
  familyId,
  shared,
  membersCanEdit,
  canManage,
  pending = false,
  onSharedChange,
  onMembersCanEditChange,
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
          </Link>
          {membersCanEdit
            ? " — you can view and edit."
            : " — view only until the creator allows editing."}
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
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Network className="size-4 text-accent-deep" aria-hidden />
          Family Tree sharing
        </p>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-ink-muted">
          You can share this family’s tree and choose whether members may edit
          it. Inviting someone to the family does not share the tree until you
          turn sharing on.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-ink/30"
            checked={shared}
            disabled={pending}
            onChange={(e) => onSharedChange?.(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="font-medium">Share tree with this family</span>
            <span className="mt-0.5 block text-xs text-ink-muted">
              Members see the same tree you saved — not a copy.
            </span>
          </span>
        </label>

        <label
          className={cn(
            "flex items-start gap-3 text-sm text-ink",
            shared ? "cursor-pointer" : "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-ink/30"
            checked={shared && membersCanEdit}
            disabled={pending || !shared}
            onChange={(e) => onMembersCanEditChange?.(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="inline-flex items-center gap-1.5 font-medium">
              Allow members to edit
              {!shared ? (
                <Lock className="size-3 text-ink-muted" aria-hidden />
              ) : null}
            </span>
            <span className="mt-0.5 block text-xs text-ink-muted">
              Only available when sharing is on. You always keep ownership.
            </span>
          </span>
        </label>
      </div>

      {pending ? (
        <p className="mt-3 inline-flex items-center gap-1 text-xs text-ink-muted">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Saving…
        </p>
      ) : null}

      {shared ? (
        <p className="mt-3 text-xs text-ink-muted">
          Manage the tree in{" "}
          <Link
            href={`/family-tree?familyId=${encodeURIComponent(familyId)}`}
            className="font-semibold text-accent-deep underline-offset-2 hover:underline"
          >
            Family Tree
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
