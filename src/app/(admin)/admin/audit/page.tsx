import Link from "next/link";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import {
  ADMIN_AUDIT_ACTIONS,
  listAdminAuditLogs,
} from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/auth/admin";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatWhen(value: Date): string {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function targetHref(type: string, id: string): string | null {
  if (type === "user") return `/admin/users/${id}`;
  if (type === "media") return `/admin/safety/${id}`;
  return null;
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const actorId = await requireAdmin();
  const params = (await searchParams) ?? {};
  const q = first(params.q)?.trim() || undefined;
  const action = first(params.action)?.trim() || undefined;
  const targetType = first(params.targetType)?.trim() || undefined;
  const page = Math.max(1, Number(first(params.page) || 1) || 1);
  const pageSize = 40;

  const { logs, total } = await listAdminAuditLogs(actorId, {
    q,
    action: action === "all" ? undefined : action,
    targetType: targetType === "all" ? undefined : targetType,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function hrefFor(next: Record<string, string | undefined>) {
    const sp = new URLSearchParams();
    const merged = {
      q,
      action: action ?? "all",
      targetType: targetType ?? "all",
      page: String(page),
      ...next,
    };
    if (merged.q) sp.set("q", merged.q);
    if (merged.action && merged.action !== "all") sp.set("action", merged.action);
    if (merged.targetType && merged.targetType !== "all") {
      sp.set("targetType", merged.targetType);
    }
    if (merged.page && merged.page !== "1") sp.set("page", merged.page);
    const qs = sp.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  }

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight text-ink">
        Audit log
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Important admin actions — plan changes, suspensions, moderation
        decisions, quarantines, and job retries.
      </p>

      <form
        method="get"
        className="mt-6 flex flex-col gap-3 rounded-lg border border-ink/10 bg-canvas-deep/30 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-ink-muted">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Action, target id, actor email…"
            className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Action
          <select
            name="action"
            defaultValue={action ?? "all"}
            className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          >
            <option value="all">All</option>
            {ADMIN_AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Target
          <select
            name="targetType"
            defaultValue={targetType ?? "all"}
            className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          >
            <option value="all">All</option>
            <option value="user">user</option>
            <option value="media">media</option>
            <option value="processing_job">processing_job</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
        >
          Filter
        </button>
        {(q || action || targetType) && (
          <Link
            href="/admin/audit"
            className="px-2 py-2 text-sm text-accent-deep hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

      <p className="mt-4 text-xs text-ink-muted">
        {total} entr{total === 1 ? "y" : "ies"}
      </p>

      {logs.length === 0 ? (
        <AdminEmptyState
          className="mt-6"
          title="No audit entries yet"
          description="Plan changes, suspensions, moderation decisions, quarantines, and job retries will appear here."
          actionHref="/admin"
          actionLabel="Back to overview →"
        />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-ink/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-canvas-deep/60 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {logs.map((row) => {
                const href = targetHref(row.targetType, row.targetId);
                const meta = row.metadata ?? {};
                const metaPreview = Object.entries(meta)
                  .slice(0, 4)
                  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                  .join(" · ");

                return (
                  <tr key={row.id} className="bg-canvas/40 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                      {formatWhen(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-ink">
                        {row.actorDisplayName || row.actorEmail || row.actorId}
                      </p>
                      {row.actorEmail ? (
                        <p className="text-[11px] text-ink-muted">
                          {row.actorEmail}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs text-ink">
                        {row.action}
                      </code>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs text-ink-muted">{row.targetType}</p>
                      {href ? (
                        <Link
                          href={href}
                          className={cn(
                            "font-mono text-xs text-accent-deep hover:underline",
                          )}
                        >
                          {row.targetId.length > 24
                            ? `${row.targetId.slice(0, 12)}…`
                            : row.targetId}
                        </Link>
                      ) : (
                        <p className="font-mono text-xs text-ink">
                          {row.targetId.length > 24
                            ? `${row.targetId.slice(0, 12)}…`
                            : row.targetId}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[280px] px-3 py-2 text-xs text-ink-muted">
                      <p className="line-clamp-3 break-all">
                        {metaPreview || "—"}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-ink-muted">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={hrefFor({ page: String(page - 1) })}
                className="rounded-md border border-ink/15 px-3 py-1.5 text-ink hover:bg-ink/5"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={hrefFor({ page: String(page + 1) })}
                className="rounded-md border border-ink/15 px-3 py-1.5 text-ink hover:bg-ink/5"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
