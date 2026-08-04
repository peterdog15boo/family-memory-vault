import Link from "next/link";
import { listAdminUsers } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/admin";
import { PLAN_SLUGS } from "@/lib/db/schema";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function formatWhen(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatActive(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const actorId = await requireAdmin();
  const params = (await searchParams) ?? {};
  const q = first(params.q)?.trim() || undefined;
  const statusRaw = first(params.status) || "all";
  const planRaw = first(params.plan) || "all";
  const status =
    statusRaw === "active" ||
    statusRaw === "suspended" ||
    statusRaw === "admin"
      ? statusRaw
      : "all";
  const plan = planRaw === "all" || PLAN_SLUGS.includes(planRaw as never)
    ? planRaw
    : "all";

  const { users, total } = await listAdminUsers(actorId, {
    q,
    status,
    plan,
    limit: 100,
  });

  const filterHref = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, status, plan, ...next };
    if (merged.q) sp.set("q", merged.q);
    if (merged.status && merged.status !== "all") sp.set("status", merged.status);
    if (merged.plan && merged.plan !== "all") sp.set("plan", merged.plan);
    const qs = sp.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight text-ink">Users</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Search accounts, review usage, suspend users, or change plans for
        support.
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
            placeholder="Email, name, or user id"
            className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Status
          <select
            name="status"
            defaultValue={status}
            className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="admin">Admins</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Plan
          <select
            name="plan"
            defaultValue={plan}
            className="rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm text-ink"
          >
            <option value="all">All plans</option>
            {PLAN_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
        >
          Filter
        </button>
        {(q || status !== "all" || plan !== "all") && (
          <Link
            href="/admin/users"
            className="px-2 py-2 text-sm text-accent-deep hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {(
          [
            ["all", "All"],
            ["active", "Active"],
            ["suspended", "Suspended"],
            ["admin", "Admins"],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            href={filterHref({ status: id })}
            className={cn(
              "rounded-md px-2.5 py-1 transition",
              status === id
                ? "bg-accent/15 font-medium text-accent-deep"
                : "bg-ink/5 text-ink-muted hover:bg-ink/10",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        {total} user{total === 1 ? "" : "s"}
        {q ? ` matching “${q}”` : ""}
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-ink/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-canvas-deep/60 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Storage</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Last active</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/8">
            {users.map((user) => (
              <tr key={user.id} className="bg-canvas/40 hover:bg-canvas-deep/40">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="font-medium text-ink hover:text-accent-deep hover:underline"
                  >
                    {user.displayName || user.email}
                  </Link>
                  <p className="text-xs text-ink-muted">{user.email}</p>
                </td>
                <td className="px-3 py-2 text-ink-muted">{user.planName}</td>
                <td className="px-3 py-2 text-ink-muted">{user.storageLabel}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                  {formatWhen(user.createdAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                  {formatActive(user.lastActiveAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {user.suspendedAt ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-800">
                        Suspended
                      </span>
                    ) : (
                      <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] uppercase text-ink-muted">
                        Active
                      </span>
                    )}
                    {user.isAdmin ? (
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-accent-deep">
                        Admin
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 ? (
        <AdminEmptyState
          className="mt-8"
          title="No users match"
          description="Try clearing filters, or wait for someone to sign in so their app user row is created."
          actionHref="/admin/users"
          actionLabel="Clear filters →"
        />
      ) : null}
    </div>
  );
}
