"use client";

import { US_STATE_OPTIONS, type SerializedWillDraftSummary } from "@/lib/will-planner";

function statusLabel(status: SerializedWillDraftSummary["status"]): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "draft_ready":
      return "Draft ready";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

function stateLabel(code: string | null): string {
  if (!code) return "—";
  return US_STATE_OPTIONS.find((s) => s.value === code)?.label ?? code;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function WillDraftsList({
  drafts,
}: {
  drafts: SerializedWillDraftSummary[];
}) {
  if (drafts.length === 0) return null;

  return (
    <section
      className="rounded-2xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)] p-4 sm:p-5"
      aria-label="Your will drafts"
    >
      <h2 className="font-display text-base text-[color:var(--legacy-ink)]">
        Your drafts
      </h2>
      <p className="mt-1 text-xs text-[color:var(--legacy-muted)]">
        Owner-only. These are never shared with family chat, the family tree, or
        other members — even if tree editing is enabled.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead>
            <tr className="border-b border-[color:var(--legacy-line)] text-xs text-[color:var(--legacy-muted)]">
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">State</th>
              <th className="py-2 font-medium">Last updated</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr
                key={d.id}
                className="border-b border-[color:var(--legacy-line)]/70 text-[color:var(--legacy-ink)] last:border-0"
              >
                <td className="py-2.5 pr-3">{statusLabel(d.status)}</td>
                <td className="py-2.5 pr-3">{stateLabel(d.stateCode)}</td>
                <td className="py-2.5">{formatWhen(d.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
