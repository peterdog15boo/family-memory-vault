import { requireAdmin } from "@/lib/auth/admin";
import { getAdminAnalyticsOverview } from "@/lib/admin/analytics";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MOD_LABELS: Record<string, string> = {
  pending: "Pending",
  clean: "Clean",
  adult: "Adult",
  csam_quarantined: "Quarantined",
  rejected: "Rejected",
  needs_human_review: "Needs review",
};

const MOD_BAR: Record<string, string> = {
  pending: "bg-ink/25",
  clean: "bg-accent",
  adult: "bg-amber-600/70",
  csam_quarantined: "bg-red-800",
  rejected: "bg-ink/40",
  needs_human_review: "bg-accent-deep/70",
};

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value}</p>
      {detail ? (
        <p className="mt-1 text-xs text-ink-muted">{detail}</p>
      ) : null}
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const actorId = await requireAdmin();
  const data = await getAdminAnalyticsOverview(actorId);
  const maxMod = Math.max(1, ...data.moderation.map((m) => m.count));

  const highlight = data.moderation.filter((m) =>
    ["clean", "csam_quarantined", "needs_human_review"].includes(m.status),
  );

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            High-level product and safety metrics from live database counts.
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

      <section className="mt-8">
        <h2 className="font-display text-xl text-ink">Users</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total users" value={data.users.total} />
          <MetricCard label="New today" value={data.users.newToday} />
          <MetricCard label="New (7 days)" value={data.users.new7d} />
          <MetricCard label="New (30 days)" value={data.users.new30d} />
          <MetricCard
            label="Active (7 days)"
            value={data.users.active7d}
            detail="Saw lastActiveAt"
          />
          <MetricCard
            label="Active (30 days)"
            value={data.users.active30d}
            detail="Saw lastActiveAt"
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Content & storage</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Total media"
            value={data.media.total}
            detail={`+${data.media.uploadedToday} today`}
          />
          <MetricCard
            label="Uploaded (7d)"
            value={data.media.uploaded7d}
          />
          <MetricCard
            label="Uploaded (30d)"
            value={data.media.uploaded30d}
          />
          <MetricCard
            label="Storage used"
            value={data.media.storageLabel}
            detail="Excludes quarantined"
          />
          <MetricCard
            label="Movies generated"
            value={data.movies.ready}
            detail={`${data.movies.total} total jobs`}
          />
          <MetricCard
            label="Families"
            value={data.families.total}
            detail={`+${data.families.created7d} in 7d`}
          />
        </div>
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-xl text-ink">
            Moderation breakdown
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Share of all media by moderation status.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {highlight.map((row) => (
              <div
                key={row.status}
                className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-3 py-3"
              >
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                  {MOD_LABELS[row.status] ?? row.status}
                </p>
                <p className="mt-1 font-display text-2xl text-ink">{row.count}</p>
                <p className="text-xs text-ink-muted">{row.percent}%</p>
              </div>
            ))}
          </div>

          <ul className="mt-6 space-y-3">
            {data.moderation.map((row) => (
              <li key={row.status}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-ink">
                    {MOD_LABELS[row.status] ?? row.status}
                  </span>
                  <span className="text-ink-muted">
                    {row.count} · {row.percent}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink/8">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      MOD_BAR[row.status] ?? "bg-ink/30",
                    )}
                    style={{ width: `${(row.count / maxMod) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">Period summary</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Growth over the last day, week, and month.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-ink/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-canvas-deep/60 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Metric</th>
                  <th className="px-3 py-2 font-medium">Today</th>
                  <th className="px-3 py-2 font-medium">7 days</th>
                  <th className="px-3 py-2 font-medium">30 days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                <tr className="bg-canvas/40">
                  <td className="px-3 py-2 text-ink">New users</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.users.newToday}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.users.new7d}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.users.new30d}
                  </td>
                </tr>
                <tr className="bg-canvas/40">
                  <td className="px-3 py-2 text-ink">Active users</td>
                  <td className="px-3 py-2 text-ink-muted">—</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.users.active7d}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.users.active30d}
                  </td>
                </tr>
                <tr className="bg-canvas/40">
                  <td className="px-3 py-2 text-ink">Photos uploaded</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.media.uploadedToday}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.media.uploaded7d}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.media.uploaded30d}
                  </td>
                </tr>
                <tr className="bg-canvas/40">
                  <td className="px-3 py-2 text-ink">Movies created</td>
                  <td className="px-3 py-2 text-ink-muted">—</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.movies.created7d}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.movies.created30d}
                  </td>
                </tr>
                <tr className="bg-canvas/40">
                  <td className="px-3 py-2 text-ink">Families created</td>
                  <td className="px-3 py-2 text-ink-muted">—</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.families.created7d}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {data.families.created30d}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Active users count accounts with{" "}
            <code className="text-ink">last_active_at</code> in the window
            (updated when they use the app). Storage excludes CSAM-quarantined
            objects.
          </p>
        </section>
      </div>
    </div>
  );
}
