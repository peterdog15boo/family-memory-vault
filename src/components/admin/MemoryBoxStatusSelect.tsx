"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  MEMORY_BOX_ORDER_STATUSES,
  type MemoryBoxOrderStatus,
} from "@/lib/db/schema";
import { MEMORY_BOX_STATUS_LABELS } from "@/lib/memory-box/constants";
import { cn } from "@/lib/utils";

type MemoryBoxStatusSelectProps = {
  orderId: string;
  status: MemoryBoxOrderStatus;
};

export function MemoryBoxStatusSelect({
  orderId,
  status,
}: MemoryBoxStatusSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: MemoryBoxOrderStatus) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setError(null);

    try {
      const response = await fetch("/api/admin/memory-box", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: next }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setValue(previous);
        setError(data.error || "Could not update status");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setValue(previous);
      setError("Could not update status");
    }
  }

  return (
    <div className="min-w-[9.5rem]">
      <select
        value={value}
        disabled={pending}
        onChange={(event) =>
          void onChange(event.target.value as MemoryBoxOrderStatus)
        }
        aria-label="Order status"
        className={cn(
          "w-full rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20 disabled:opacity-60",
        )}
      >
        {MEMORY_BOX_ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {MEMORY_BOX_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1 text-[11px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
