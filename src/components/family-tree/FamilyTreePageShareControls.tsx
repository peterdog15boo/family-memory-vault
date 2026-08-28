"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Network } from "lucide-react";
import { FamilyTreeSharingSettings } from "@/components/family/FamilyTreeSharingSettings";
import { cn } from "@/lib/utils";

type Props = {
  familyId: string;
  familyName: string;
  isOwner: boolean;
  treeSharedWithFamily: boolean;
  className?: string;
};

/**
 * Primary share controls on the Family Tree page (mirrors Family settings).
 */
export function FamilyTreePageShareControls({
  familyId,
  familyName,
  isOwner,
  treeSharedWithFamily,
  className,
}: Props) {
  const router = useRouter();
  const [shared, setShared] = useState(treeSharedWithFamily);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <FamilyTreeSharingSettings
        familyId={familyId}
        shared={shared}
        canManage
        pending={pending}
        onSharedChange={(next) => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch(`/api/family/${familyId}/tree-sharing`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ shared: next }),
              });
              const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                family?: { treeSharedWithFamily?: boolean };
              };
              if (!res.ok) {
                throw new Error(data.error || "Could not update sharing.");
              }
              setShared(
                Boolean(data.family?.treeSharedWithFamily ?? next),
              );
              router.refresh();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not update sharing.",
              );
            }
          });
        }}
      />
      <p className="text-xs text-ink-muted">
        Inviting someone to the {familyName} family is what grants tree access.
      </p>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <p className="inline-flex items-center gap-1 text-xs text-ink-muted">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Saving…
        </p>
      ) : null}
    </div>
  );
}

type CreateProps = {
  familyId: string;
  familyName: string;
};

/**
 * Explicit create for a family that does not yet have a tree.
 */
export function CreateFamilyTreeButton({ familyId, familyName }: CreateProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-ink/10 bg-canvas/90 px-5 py-8 text-center">
      <Network className="mx-auto size-8 text-accent-deep" aria-hidden />
      <p className="mt-3 text-lg font-semibold text-ink">
        Create a tree for {familyName}.
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        This tree belongs to the {familyName} family. Members you invite to the
        family can view it once you share.
      </p>
      <button
        type="button"
        className="btn btn-primary mt-5"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await fetch("/api/family-tree/ensure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ familyId }),
              });
              const data = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              if (!res.ok) {
                throw new Error(data.error || "Could not create the tree.");
              }
              router.push(
                `/family-tree?familyId=${encodeURIComponent(familyId)}`,
              );
              router.refresh();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not create the tree.",
              );
            }
          });
        }}
      >
        {pending ? "Creating…" : `Create tree for ${familyName}`}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
