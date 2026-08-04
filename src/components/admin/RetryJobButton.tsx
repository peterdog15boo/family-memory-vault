"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmAdminAction } from "@/lib/admin/confirm";

type RetryJobButtonProps = {
  jobId: string;
  jobType?: string;
  resetAttempts?: boolean;
};

export function RetryJobButton({
  jobId,
  jobType,
  resetAttempts = false,
}: RetryJobButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onRetry() {
    const label = jobType || jobId;
    const message = resetAttempts
      ? `Retry job “${label}” and reset attempt count?\n\nIt will return to the pending queue for workers to pick up.`
      : `Retry job “${label}”?\n\nIt will return to the pending queue for workers to pick up.`;
    if (!confirmAdminAction(message)) return;

    setError(null);
    try {
      const response = await fetch("/api/admin/ops/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry",
          jobId,
          resetAttempts,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Retry failed");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => void onRetry()}
        className="rounded-md border border-ink/15 px-2.5 py-1 text-xs font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
      >
        {pending ? "…" : resetAttempts ? "Retry (reset attempts)" : "Retry job"}
      </button>
      {error ? (
        <p className="mt-1 text-[11px] text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
