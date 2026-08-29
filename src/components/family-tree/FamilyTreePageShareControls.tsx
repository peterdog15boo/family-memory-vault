"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Network } from "lucide-react";
import { FamilyTreeSharingSettings } from "@/components/family/FamilyTreeSharingSettings";
import { cn } from "@/lib/utils";

type Props = {
  familyId: string;
  familyName: string;
  isOwner: boolean;
  treeSharedWithFamily: boolean;
  membersCanEdit: boolean;
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
  membersCanEdit,
  className,
}: Props) {
  const router = useRouter();
  const [shared, setShared] = useState(treeSharedWithFamily);
  const [edit, setEdit] = useState(membersCanEdit);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShared(treeSharedWithFamily);
    setEdit(membersCanEdit);
  }, [treeSharedWithFamily, membersCanEdit]);

  if (!isOwner) return null;

  function save(nextShared: boolean, nextEdit: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/family/${familyId}/tree-sharing`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shared: nextShared,
            membersCanEdit: nextShared ? nextEdit : false,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          family?: {
            treeSharedWithFamily?: boolean;
            shareWithMembers?: boolean;
            membersCanEdit?: boolean;
          };
        };
        if (!res.ok) {
          throw new Error(data.error || "Could not update sharing.");
        }
        setShared(
          Boolean(
            data.family?.shareWithMembers ??
              data.family?.treeSharedWithFamily ??
              nextShared,
          ),
        );
        setEdit(Boolean(data.family?.membersCanEdit ?? nextEdit));
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not update sharing.",
        );
      }
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      <FamilyTreeSharingSettings
        familyId={familyId}
        shared={shared}
        membersCanEdit={edit}
        canManage
        pending={pending}
        onSharedChange={(next) => {
          setShared(next);
          if (!next) setEdit(false);
          save(next, next ? edit : false);
        }}
        onMembersCanEditChange={(next) => {
          setEdit(next);
          save(shared, next);
        }}
      />
      <p className="text-xs text-ink-muted">
        You can share this family’s tree and choose whether members may edit it.
        Sharing is separate from inviting people to {familyName}.
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
        This tree belongs to the {familyName} family. You can share it and choose
        whether members may edit it after it’s created.
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
