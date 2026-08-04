import Link from "next/link";
import { Film } from "lucide-react";
import { getAdminOpsOverview } from "@/lib/admin/ops";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Lightweight movies ops surface — full queue tooling lives on /admin/ops.
 */
export default async function AdminMoviesPage() {
  const actorId = await requireAdmin();
  const ops = await getAdminOpsOverview(actorId);
  const moviePipe = ops.pipelines.find((p) => p.key === "movies");

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight text-ink">Movies</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
        Movie generation snapshot. Use System ops for failed job retry.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            Ready
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {ops.movies.ready}
          </p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            Failed
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {ops.movies.failed}
          </p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            In flight
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {ops.movies.queued + ops.movies.processing}
          </p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 px-3 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            7d success
          </p>
          <p className="mt-1 font-display text-2xl text-ink">
            {ops.movies.successRate7d != null
              ? `${ops.movies.successRate7d}%`
              : "—"}
          </p>
        </div>
      </div>

      {moviePipe ? (
        <p className="mt-6 text-sm text-ink-muted">
          Render queue: {moviePipe.detail}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/ops"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
        >
          <Film className="size-4" aria-hidden />
          Open system ops
        </Link>
        <Link
          href="/movies"
          className="rounded-md border border-ink/15 px-3 py-2 text-sm text-ink hover:bg-ink/5"
        >
          Family Movies →
        </Link>
      </div>
    </div>
  );
}
