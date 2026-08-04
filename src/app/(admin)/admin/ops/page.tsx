import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Film } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { RetryJobButton } from "@/components/admin/RetryJobButton";
import { getAdminOpsOverview } from "@/lib/admin/ops";
import { requireAdmin } from "@/lib/auth/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function formatWhen(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HEALTH_STYLE = {
  ok: "border-accent/30 bg-accent/10 text-accent-deep",
  attention: "border-amber-400/40 bg-amber-50 text-amber-900",
  critical: "border-red-300/50 bg-red-50 text-red-900",
} as const;

export default async function AdminOpsPage() {
  const actorId = await requireAdmin();
  const data = await getAdminOpsOverview(actorId);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">
            System ops
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Queue health, failed jobs, storage, and movie pipeline rates.
          </p>
        </div>
        <p className="text-xs text-ink-muted">
          As of{" "}
          {data.generatedAt.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* Pipeline health */}
      <section className="mt-8">
        <h2 className="font-display text-xl text-ink">Pipeline health</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {data.pipelines.map((pipe) => (
            <div
              key={pipe.key}
              className={cn(
                "rounded-lg border px-4 py-3",
                HEALTH_STYLE[pipe.status],
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{pipe.label}</p>
                {pipe.status === "ok" ? (
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                ) : (
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                )}
              </div>
              <p className="mt-2 text-[11px] uppercase tracking-wide opacity-80">
                {pipe.status}
              </p>
              <p className="mt-1 text-sm">{pipe.detail}</p>
              <p className="mt-2 text-xs opacity-80">
                {pipe.pending} pending · {pipe.processing} processing ·{" "}
                {pipe.failed} failed
              </p>
              <p className="mt-1 text-xs opacity-80">
                7d: {pipe.completed7d} completed · {pipe.failed7d} failed
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Queue + storage + movies */}
      <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
            <Activity className="size-3.5" aria-hidden />
            Queue
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {data.jobsByStatus.pending + data.jobsByStatus.processing}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {data.jobsByStatus.pending} pending ·{" "}
            {data.jobsByStatus.processing} processing ·{" "}
            {data.jobsByStatus.failed} failed
          </p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            Storage
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {data.storage.totalLabel}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {data.storage.mediaCount} media · quarantine{" "}
            {data.storage.quarantinedLabel}
          </p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
            <Film className="size-3.5" aria-hidden />
            Movies (7d)
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {data.movies.successRate7d != null
              ? `${data.movies.successRate7d}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Success rate · {data.movies.ready7d} ready · {data.movies.failed7d}{" "}
            failed
          </p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            Movies (all time)
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {data.movies.ready}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            ready · {data.movies.queued} queued · {data.movies.processing}{" "}
            processing · {data.movies.failed} failed
          </p>
        </div>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-xl text-ink">Jobs by type</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Active backlog (pending / processing / failed).
          </p>
          {data.jobsByType.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink-muted">
              No active or failed jobs.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-ink/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-canvas-deep/60 text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Pending</th>
                    <th className="px-3 py-2 font-medium">Processing</th>
                    <th className="px-3 py-2 font-medium">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/8">
                  {data.jobsByType.map((row) => (
                    <tr key={row.type} className="bg-canvas/40">
                      <td className="px-3 py-2 font-mono text-xs text-ink">
                        {row.type}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{row.pending}</td>
                      <td className="px-3 py-2 text-ink-muted">
                        {row.processing}
                      </td>
                      <td className="px-3 py-2 text-ink-muted">{row.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            Lifetime queue: {data.jobsByStatus.completed} completed ·{" "}
            {data.jobsByStatus.cancelled} cancelled · {data.jobsByStatus.total}{" "}
            total rows
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">Recent errors</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Jobs with a stored <code className="text-ink">last_error</code>{" "}
            (any status).
          </p>
          {data.recentErrors.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink-muted">
              No recent job errors.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-ink/8 rounded-lg border border-ink/10">
              {data.recentErrors.map((err) => (
                <li key={err.id} className="px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-mono text-xs text-ink">{err.type}</p>
                    <span className="text-[11px] text-ink-muted">
                      {formatWhen(err.updatedAt)} · {err.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink-muted">
                    {err.lastError}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl text-ink">Failed jobs</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Retry re-queues the job as pending. “Retry (reset)” also clears
              attempt count.
            </p>
          </div>
          <Link
            href="/admin/movies"
            className="text-xs text-accent-deep hover:underline"
          >
            Movies admin →
          </Link>
        </div>

        {data.recentFailedJobs.length === 0 ? (
          <AdminEmptyState
            className="mt-4"
            icon={CheckCircle2}
            title="No failed jobs"
            description="Pipelines look clear. Failed queue items will show up here with retry controls."
            actionHref="/admin/analytics"
            actionLabel="View analytics →"
          />
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-ink/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-canvas-deep/60 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Error</th>
                  <th className="px-3 py-2 font-medium">Attempts</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {data.recentFailedJobs.map((job) => (
                  <tr key={job.id} className="bg-canvas/40 align-top">
                    <td className="px-3 py-2">
                      <p className="font-mono text-xs text-ink">{job.type}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                        {job.id}
                      </p>
                      {job.mediaId ? (
                        <Link
                          href={`/admin/safety/${job.mediaId}`}
                          className="mt-1 inline-block text-[11px] text-accent-deep hover:underline"
                        >
                          Photo
                        </Link>
                      ) : null}
                      {typeof job.payload.movieId === "string" ? (
                        <p className="mt-0.5 text-[10px] text-ink-muted">
                          movie {job.payload.movieId}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-w-[280px] px-3 py-2 text-xs text-ink-muted">
                      <p className="line-clamp-3">{job.lastError || "—"}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                      {job.attempts}/{job.maxAttempts}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                      {formatWhen(job.updatedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1.5">
                        <RetryJobButton jobId={job.id} jobType={job.type} />
                        <RetryJobButton
                          jobId={job.id}
                          jobType={job.type}
                          resetAttempts
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
