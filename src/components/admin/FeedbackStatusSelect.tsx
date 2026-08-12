"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FEEDBACK_SUBMISSION_STATUSES,
  type FeedbackSubmissionStatus,
} from "@/lib/db/schema";
import { FEEDBACK_STATUS_LABELS } from "@/lib/admin/feedback";
import { cn } from "@/lib/utils";

type FeedbackStatusSelectProps = {
  id: string;
  status: FeedbackSubmissionStatus;
};

export function FeedbackStatusSelect({
  id,
  status,
}: FeedbackStatusSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: FeedbackSubmissionStatus) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setError(null);

    try {
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
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
          void onChange(event.target.value as FeedbackSubmissionStatus)
        }
        aria-label="Feedback status"
        className={cn(
          "w-full rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/20 disabled:opacity-60",
        )}
      >
        {FEEDBACK_SUBMISSION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {FEEDBACK_STATUS_LABELS[s]}
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
