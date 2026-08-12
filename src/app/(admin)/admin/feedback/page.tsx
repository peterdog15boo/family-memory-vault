import Link from "next/link";
import type { ReactNode } from "react";
import { Bug, Lightbulb, MessageSquareHeart } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { FeedbackStatusSelect } from "@/components/admin/FeedbackStatusSelect";
import {
  countAdminFeedbackByStatus,
  FEEDBACK_MODE_LABELS,
  FEEDBACK_STATUS_LABELS,
  getAdminFeedbackSubmission,
  getFeedbackScreenshotUrl,
  isFeedbackMode,
  listAdminFeedbackSubmissions,
} from "@/lib/admin/feedback";
import { requireAdmin } from "@/lib/auth/admin";
import {
  FEEDBACK_SUBMISSION_STATUSES,
  type FeedbackSubmissionStatus,
} from "@/lib/db/schema";
import type { FeedbackMode } from "@/lib/feedback/categories";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatWhen(value: Date): string {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    mode?: string;
    id?: string;
  }>;
};

export default async function AdminFeedbackPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = (await searchParams) ?? {};

  const statusFilter: FeedbackSubmissionStatus | "all" =
    params.status &&
    FEEDBACK_SUBMISSION_STATUSES.includes(
      params.status as FeedbackSubmissionStatus,
    )
      ? (params.status as FeedbackSubmissionStatus)
      : "all";

  const modeFilter: FeedbackMode | "all" =
    params.mode && isFeedbackMode(params.mode) ? params.mode : "all";

  const [items, counts] = await Promise.all([
    listAdminFeedbackSubmissions({
      status: statusFilter,
      mode: modeFilter,
      limit: 100,
    }),
    countAdminFeedbackByStatus(),
  ]);

  const selectedId = params.id?.trim() || null;
  const selectedRow = selectedId
    ? (items.find((item) => item.id === selectedId) ??
      (await getAdminFeedbackSubmission(selectedId)))
    : null;
  const screenshotUrl = selectedRow
    ? await getFeedbackScreenshotUrl(selectedRow.screenshotKey)
    : null;

  const newCount = counts.new;

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">
            Feedback
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Beta bug reports and feature requests from testers. Update status as
            you triage — reporters can see status on their recent history.
          </p>
        </div>
        <p className="text-xs text-ink-muted">
          {items.length} shown
          {statusFilter === "all" && newCount > 0 ? ` · ${newCount} new` : null}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <FilterChip
          href={buildHref({ mode: modeFilter })}
          active={statusFilter === "all"}
        >
          All statuses
        </FilterChip>
        {FEEDBACK_SUBMISSION_STATUSES.map((status) => (
          <FilterChip
            key={status}
            href={buildHref({ status, mode: modeFilter })}
            active={statusFilter === status}
          >
            {FEEDBACK_STATUS_LABELS[status]}
            {counts[status] > 0 ? ` (${counts[status]})` : ""}
          </FilterChip>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <FilterChip
          href={buildHref({ status: statusFilter })}
          active={modeFilter === "all"}
        >
          All types
        </FilterChip>
        <FilterChip
          href={buildHref({ status: statusFilter, mode: "bug" })}
          active={modeFilter === "bug"}
        >
          Bug reports
        </FilterChip>
        <FilterChip
          href={buildHref({ status: statusFilter, mode: "feature" })}
          active={modeFilter === "feature"}
        >
          Feature requests
        </FilterChip>
      </div>

      {items.length === 0 ? (
        <div className="mt-10">
          <AdminEmptyState
            icon={MessageSquareHeart}
            title="No feedback yet"
            description="When beta testers send bug reports or feature requests, they’ll show up here for triage."
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
          <div className="overflow-x-auto rounded-xl border border-ink/10">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-ink/10 bg-canvas-deep/40 text-[11px] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Ticket</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const active = selectedRow?.id === item.id;
                  const ModeIcon = item.mode === "feature" ? Lightbulb : Bug;
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "border-b border-ink/8 last:border-0",
                        active ? "bg-accent/8" : "hover:bg-ink/[0.02]",
                      )}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <Link
                          href={buildHref({
                            status: statusFilter,
                            mode: modeFilter,
                            id: item.id,
                          })}
                          className="font-mono text-xs font-medium text-accent-deep hover:underline"
                        >
                          {item.ticketId}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                          <ModeIcon className="size-3.5 shrink-0" aria-hidden />
                          {FEEDBACK_MODE_LABELS[
                            item.mode === "feature" ? "feature" : "bug"
                          ]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <Link
                          href={buildHref({
                            status: statusFilter,
                            mode: modeFilter,
                            id: item.id,
                          })}
                          className="line-clamp-2 font-medium text-ink hover:underline"
                        >
                          {item.title}
                        </Link>
                        <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                          {item.email || item.userId || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 align-top text-xs text-ink-muted">
                        {item.category}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <FeedbackStatusSelect
                          id={item.id}
                          status={
                            item.status as FeedbackSubmissionStatus
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-xs text-ink-muted">
                        {formatWhen(item.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <aside className="rounded-xl border border-ink/10 bg-canvas-deep/20 p-4 lg:sticky lg:top-4 lg:self-start">
            {selectedRow ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-mono text-xs text-accent-deep">
                    {selectedRow.ticketId}
                  </p>
                  <h2 className="mt-1 font-display text-lg tracking-tight text-ink">
                    {selectedRow.title}
                  </h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    {
                      FEEDBACK_MODE_LABELS[
                        selectedRow.mode === "feature" ? "feature" : "bug"
                      ]
                    }
                    {" · "}
                    {selectedRow.category}
                    {selectedRow.severity
                      ? ` · ${selectedRow.severity}`
                      : null}
                  </p>
                </div>

                <DetailBlock label="Description">
                  {selectedRow.description}
                </DetailBlock>
                {selectedRow.expectedBehavior ? (
                  <DetailBlock label="Expected">
                    {selectedRow.expectedBehavior}
                  </DetailBlock>
                ) : null}
                {selectedRow.problemStatement ? (
                  <DetailBlock label="Problem">
                    {selectedRow.problemStatement}
                  </DetailBlock>
                ) : null}
                {selectedRow.suggestedSolution ? (
                  <DetailBlock label="Suggested">
                    {selectedRow.suggestedSolution}
                  </DetailBlock>
                ) : null}

                <DetailBlock label="Reporter">
                  {[selectedRow.email, selectedRow.userId]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </DetailBlock>
                <DetailBlock label="Page">
                  <a
                    href={selectedRow.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-accent-deep hover:underline"
                  >
                    {selectedRow.pageUrl}
                  </a>
                </DetailBlock>
                <DetailBlock label="Environment">
                  {[
                    selectedRow.browser,
                    selectedRow.os,
                    selectedRow.viewportWidth != null &&
                    selectedRow.viewportHeight != null
                      ? `${selectedRow.viewportWidth}×${selectedRow.viewportHeight}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </DetailBlock>

                {screenshotUrl ? (
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                      Screenshot
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotUrl}
                      alt={`Screenshot for ${selectedRow.ticketId}`}
                      className="mt-1.5 max-h-64 w-full rounded-lg border border-ink/10 object-contain object-top bg-canvas"
                    />
                  </div>
                ) : selectedRow.screenshotKey ? (
                  <p className="text-xs text-ink-muted">
                    Screenshot on file ({selectedRow.screenshotKey}) — could not
                    sign URL.
                  </p>
                ) : null}

                {Array.isArray(selectedRow.consoleErrors) &&
                selectedRow.consoleErrors.length > 0 ? (
                  <DetailBlock label="Console errors">
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-ink-muted">
                      {selectedRow.consoleErrors.join("\n")}
                    </pre>
                  </DetailBlock>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Select a ticket to read the full report, technical context, and
                screenshot.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function buildHref(input: {
  status?: FeedbackSubmissionStatus | "all";
  mode?: FeedbackMode | "all";
  id?: string;
}): string {
  const params = new URLSearchParams();
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.mode && input.mode !== "all") params.set("mode", input.mode);
  if (input.id) params.set("id", input.id);
  const qs = params.toString();
  return qs ? `/admin/feedback?${qs}` : "/admin/feedback";
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition",
        active
          ? "border-accent/40 bg-accent/10 text-accent-deep"
          : "border-ink/10 text-ink-muted hover:border-ink/20 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {children}
      </div>
    </div>
  );
}
