import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { ADMIN_TOOLS } from "@/lib/admin/nav";
import { requireAdmin } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { media, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await requireAdmin();

  const db = getDb();
  const [[userCount], [reviewCount], [adminCount]] = await Promise.all([
    db.select({ value: count() }).from(users),
    db
      .select({ value: count() })
      .from(media)
      .where(eq(media.moderationStatus, "needs_human_review")),
    db
      .select({ value: count() })
      .from(users)
      .where(eq(users.isAdmin, true)),
  ]);

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight text-ink">
        Admin overview
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Internal tools for Family Memory Vault. Actions are audited. Not
        customer-facing.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            Users
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {userCount?.value ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            Admins (DB)
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {adminCount?.value ?? 0}
          </p>
        </div>
        <Link
          href="/admin/review"
          className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-4 py-3 transition hover:border-accent/30"
        >
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            Needs review
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {reviewCount?.value ?? 0}
          </p>
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Tools</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {ADMIN_TOOLS.map(({ href, label, description, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex gap-3 rounded-lg border border-ink/10 bg-canvas-deep/30 px-4 py-4 transition hover:border-accent/30 hover:bg-canvas-deep/60"
              >
                <Icon
                  className="mt-0.5 size-5 shrink-0 text-accent"
                  aria-hidden
                />
                <div>
                  <p className="font-medium text-ink">{label}</p>
                  <p className="mt-1 text-sm text-ink-muted">{description}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
