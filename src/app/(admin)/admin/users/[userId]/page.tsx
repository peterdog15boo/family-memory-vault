import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminUserActions } from "@/components/admin/AdminUserActions";
import { getAdminUserDetail } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/admin";
import { listActivePlans } from "@/lib/plans";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ userId: string }>;
};

function formatWhen(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const actorId = await requireAdmin();
  const { userId } = await params;
  const [user, plans] = await Promise.all([
    getAdminUserDetail(actorId, userId),
    listActivePlans(),
  ]);

  if (!user) notFound();

  return (
    <div>
      <p className="text-sm text-ink-muted">
        <Link href="/admin/users" className="text-accent-deep hover:underline">
          ← Users
        </Link>
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink">
            {user.displayName || user.email}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{user.email}</p>
          <p className="mt-1 font-mono text-[11px] text-ink-muted">{user.id}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {user.suspendedAt ? (
              <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-medium uppercase text-red-800">
                Suspended
              </span>
            ) : (
              <span className="rounded bg-ink/5 px-2 py-0.5 text-[11px] uppercase text-ink-muted">
                Active
              </span>
            )}
            {user.isAdmin ? (
              <span className="rounded bg-accent/15 px-2 py-0.5 text-[11px] font-medium uppercase text-accent-deep">
                Admin
              </span>
            ) : null}
            <span className="rounded bg-ink/5 px-2 py-0.5 text-[11px] text-ink-muted">
              {user.planName}
            </span>
          </div>
          {user.suspendedReason ? (
            <p className="mt-2 text-sm text-red-800">
              Reason: {user.suspendedReason}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Photos", user.counts.media],
            ["Memories", user.counts.memories],
            ["Families", user.counts.families],
            ["Moderation events", user.counts.moderationEvents],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-3 py-3"
          >
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">
              {label}
            </p>
            <p className="mt-1 font-display text-2xl text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <section>
            <h2 className="font-display text-xl text-ink">Account</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Joined</dt>
                <dd className="text-ink">{formatWhen(user.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Last active</dt>
                <dd className="text-ink">{formatWhen(user.lastActiveAt)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Storage used</dt>
                <dd className="text-ink">{user.storageLabel}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Subscription</dt>
                <dd className="text-ink">
                  {user.subscription
                    ? `${user.subscription.planName} · ${user.subscription.status}`
                    : "Free (no row)"}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="font-display text-xl text-ink">Families</h2>
            {user.families.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">No family memberships.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink/8 rounded-lg border border-ink/10">
                {user.families.map((f) => (
                  <li key={f.id} className="px-3 py-2 text-sm">
                    <p className="font-medium text-ink">{f.name}</p>
                    <p className="text-xs text-ink-muted">
                      {f.role} · {f.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-display text-xl text-ink">Moderation breakdown</h2>
            {user.moderationByStatus.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">No media yet.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {user.moderationByStatus.map((row) => (
                  <li
                    key={row.status}
                    className="rounded-md bg-ink/5 px-2.5 py-1 text-xs text-ink"
                  >
                    {row.status}: {row.count}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="font-display text-xl text-ink">
              Recent moderation history
            </h2>
            {user.recentModeration.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">No moderation events.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink/8 rounded-lg border border-ink/10">
                {user.recentModeration.map((ev) => (
                  <li key={ev.id} className="px-3 py-2 text-sm">
                    <p className="font-medium text-ink">
                      {ev.eventType}
                      {ev.newModerationStatus
                        ? ` → ${ev.newModerationStatus}`
                        : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {ev.filename || ev.mediaId} · {ev.source} ·{" "}
                      {formatWhen(ev.createdAt)}
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

        <AdminUserActions
          userId={user.id}
          email={user.email}
          isAdmin={user.isAdmin}
          isSuspended={Boolean(user.suspendedAt)}
          planSlug={user.planSlug}
          isSelf={actorId === user.id}
          plans={plans.map((p) => ({ slug: p.slug, name: p.name }))}
        />
      </div>
    </div>
  );
}
