import Link from "next/link";
import { ClipboardCheck, Shield } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  getSafetyStatusCounts,
  listRecentAdminModerationActions,
  listRecentNcmecReports,
  listRecentQuarantinedMedia,
  listSafetyOverviewMedia,
  parsePage,
  parseSafetyFilter,
  type SafetyOverviewFilter,
} from "@/lib/moderation/safety-overview";
import { requireAdmin } from "@/lib/auth/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ id: SafetyOverviewFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "clean", label: "Clean" },
  { id: "adult", label: "Adult" },
  { id: "quarantined", label: "Quarantined" },
  { id: "needs_review", label: "Needs review" },
  { id: "rejected", label: "Rejected" },
  { id: "ncmec_reported", label: "NCMEC reported" },
];

function first(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatWhen(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function score(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

function hrefFor(opts: {
  status?: string;
  q?: string;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (opts.status && opts.status !== "all") sp.set("status", opts.status);
  if (opts.q) sp.set("q", opts.q);
  if (opts.page && opts.page > 1) sp.set("page", String(opts.page));
  const qs = sp.toString();
  return qs ? `/admin/safety?${qs}` : "/admin/safety";
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminSafetyPage({ searchParams }: PageProps) {
  const userId = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filter = parseSafetyFilter(params.status);
  const q = first(params.q)?.trim() || undefined;
  const page = parsePage(params.page);

  const [counts, quarantined, ncmecReports, listed, adminActions] =
    await Promise.all([
      getSafetyStatusCounts(userId),
      listRecentQuarantinedMedia(userId, 6),
      listRecentNcmecReports(userId, 6),
      listSafetyOverviewMedia(userId, {
        filter,
        q,
        page,
        pageSize: 25,
      }),
      listRecentAdminModerationActions(userId, 12),
    ]);

  const summaryCards = [
    {
      key: "pending",
      label: "Pending",
      value: counts.pending,
      status: "pending",
    },
    { key: "clean", label: "Clean", value: counts.clean, status: "clean" },
    { key: "adult", label: "Adult", value: counts.adult, status: "adult" },
    {
      key: "quarantined",
      label: "Quarantined",
      value: counts.csam_quarantined,
      status: "quarantined",
    },
    {
      key: "needs_review",
      label: "Needs review",
      value: counts.needs_human_review,
      status: "needs_review",
    },
    {
      key: "rejected",
      label: "Rejected",
      value: counts.rejected,
      status: "rejected",
    },
  ] as const;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">
            Safety overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Moderation counts, quarantines, and NCMEC reports. Quarantined
            content is metadata-only — never previewed here.
          </p>
        </div>
        <Link
          href="/admin/review"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
        >
          <ClipboardCheck className="size-4" aria-hidden />
          Review queue
          {counts.needs_human_review > 0
            ? ` (${counts.needs_human_review})`
            : ""}
        </Link>
      </div>

      <p className="mt-5 flex gap-2 text-xs text-ink-muted">
        <Shield className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        {counts.total} media rows total
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => (
          <Link
            key={card.key}
            href={hrefFor({ status: card.status, q })}
            className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-3 py-3 transition hover:border-accent/30 hover:bg-canvas-deep/70"
          >
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">
              {card.label}
            </p>
            <p className="mt-1 font-display text-2xl text-ink">{card.value}</p>
          </Link>
        ))}
      </section>

      <form
        method="get"
        className="mt-8 flex flex-col gap-3 rounded-lg border border-ink/10 bg-canvas-deep/30 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        {filter !== "all" ? (
          <input type="hidden" name="status" value={filter} />
        ) : null}
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-ink-muted">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Filename, media id, email…"
            className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
        >
          Search
        </button>
        {q ? (
          <Link
            href={hrefFor({ status: filter })}
            className="px-2 py-2 text-sm text-accent-deep hover:underline"
          >
            Clear search
          </Link>
        ) : null}
      </form>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Safety filters">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <Link
              key={f.id}
              href={hrefFor({ status: f.id, q })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                active
                  ? "bg-accent/15 font-medium text-accent-deep"
                  : "bg-ink/5 text-ink-muted hover:bg-ink/10 hover:text-ink",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-ink">Recent quarantined</h2>
            <Link
              href={hrefFor({ status: "quarantined" })}
              className="text-xs text-accent-deep hover:underline"
            >
              View all
            </Link>
          </div>
          {quarantined.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink-muted">
              No quarantined items.
            </p>
          ) : (
            <ul className="divide-y divide-ink/8 rounded-lg border border-ink/10 bg-canvas-deep/30">
              {quarantined.map((item) => (
                <li key={item.id} className="px-4 py-3 text-sm">
                  <Link
                    href={`/admin/safety/${item.id}`}
                    className="font-medium text-ink hover:text-accent-deep hover:underline"
                  >
                    {item.originalFilename || item.id}
                  </Link>
                  <p className="mt-1 text-xs text-ink-muted">
                    Quarantined {formatWhen(item.quarantinedAt)} · PhotoDNA{" "}
                    {item.photodnaMatch ? "match" : "no match"} · CSAM{" "}
                    {score(item.aiCsamScore)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-display text-xl text-ink">Recent NCMEC reports</h2>
            <Link
              href={hrefFor({ status: "ncmec_reported" })}
              className="text-xs text-accent-deep hover:underline"
            >
              View all
            </Link>
          </div>
          {ncmecReports.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink-muted">
              No NCMEC report ids stored yet.
            </p>
          ) : (
            <ul className="divide-y divide-ink/8 rounded-lg border border-ink/10 bg-canvas-deep/30">
              {ncmecReports.map((item) => (
                <li key={item.id} className="px-4 py-3 text-sm">
                  <Link
                    href={`/admin/safety/${item.id}`}
                    className="font-medium text-ink hover:text-accent-deep hover:underline"
                  >
                    {item.ncmecReportId}
                  </Link>
                  <p className="mt-1 text-xs text-ink-muted">
                    Reported {formatWhen(item.ncmecReportedAt)} ·{" "}
                    {item.originalFilename || item.id}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl text-ink">
            {filter === "all" ? "Photos" : `Filtered: ${filter}`}
            <span className="ml-2 text-sm font-sans text-ink-muted">
              {listed.total} result{listed.total === 1 ? "" : "s"}
            </span>
          </h2>
          {filter === "needs_review" ? (
            <Link
              href="/admin/review"
              className="text-xs font-medium text-accent-deep hover:underline"
            >
              Go to review queue →
            </Link>
          ) : null}
        </div>

        {listed.items.length === 0 ? (
          <AdminEmptyState
            title="No rows for this filter"
            description="Try another status chip or clear the search query."
            actionHref="/admin/safety"
            actionLabel="Reset filters →"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-canvas-deep/60 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Moderation</th>
                  <th className="px-3 py-2 font-medium">PhotoDNA</th>
                  <th className="px-3 py-2 font-medium">Scores</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {listed.items.map((row) => (
                  <tr key={row.id} className="bg-canvas/40 hover:bg-canvas-deep/40">
                    <td className="max-w-[200px] truncate px-3 py-2">
                      <Link
                        href={`/admin/safety/${row.id}`}
                        className="font-medium text-ink hover:text-accent-deep hover:underline"
                      >
                        {row.originalFilename || row.id}
                      </Link>
                      {row.moderationStatus === "needs_human_review" ? (
                        <Link
                          href="/admin/review"
                          className="ml-2 text-xs text-accent-deep hover:underline"
                        >
                          Review
                        </Link>
                      ) : null}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-ink-muted">
                      {row.ownerEmail || row.userId.slice(0, 12)}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {row.moderationStatus}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {row.photodnaMatch ? "match" : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      CSAM {score(row.aiCsamScore)} · nudity{" "}
                      {score(row.aiNudityScore)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                      {formatWhen(row.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {listed.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-ink-muted">
              Page {listed.page} of {listed.totalPages}
            </p>
            <div className="flex gap-2">
              {listed.page > 1 ? (
                <Link
                  href={hrefFor({ status: filter, q, page: listed.page - 1 })}
                  className="rounded-md border border-ink/15 px-3 py-1.5 text-ink hover:bg-ink/5"
                >
                  Previous
                </Link>
              ) : null}
              {listed.page < listed.totalPages ? (
                <Link
                  href={hrefFor({ status: filter, q, page: listed.page + 1 })}
                  className="rounded-md border border-ink/15 px-3 py-1.5 text-ink hover:bg-ink/5"
                >
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Recent admin actions</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Review decisions, inspections, and other admin.safety / admin.review
          events.
        </p>
        {adminActions.length === 0 ? (
          <p className="mt-4 rounded-md border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink-muted">
            No admin actions logged yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink/8 rounded-lg border border-ink/10">
            {adminActions.map((ev) => (
              <li key={ev.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/admin/safety/${ev.mediaId}`}
                    className="font-medium text-ink hover:text-accent-deep hover:underline"
                  >
                    {ev.eventType}
                    {ev.newModerationStatus ? ` → ${ev.newModerationStatus}` : ""}
                  </Link>
                  <span className="text-xs text-ink-muted">
                    {formatWhen(ev.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {ev.filename || ev.mediaId} · {ev.source}
                  {ev.actorEmail ? ` · ${ev.actorEmail}` : ""}
                </p>
                {ev.notes ? (
                  <p className="mt-1 text-xs text-ink-muted">{ev.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
