import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth/admin";
import { getSafetyMediaInspect } from "@/lib/moderation/safety-overview";
import { formatBytes } from "@/lib/billing/quotas";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ mediaId: string }>;
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

function score(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(3);
}

export default async function AdminSafetyInspectPage({ params }: PageProps) {
  const actorId = await requireAdmin();
  const { mediaId } = await params;
  const item = await getSafetyMediaInspect(actorId, mediaId);

  if (!item) notFound();

  return (
    <div>
      <p className="text-sm text-ink-muted">
        <Link href="/admin/safety" className="text-accent-deep hover:underline">
          ← Safety
        </Link>
        {item.moderationStatus === "needs_human_review" ? (
          <>
            {" · "}
            <Link
              href="/admin/review"
              className="text-accent-deep hover:underline"
            >
              Review queue
            </Link>
          </>
        ) : null}
        {" · "}
        <Link
          href={`/admin/users/${item.userId}`}
          className="text-accent-deep hover:underline"
        >
          Owner
        </Link>
      </p>

      <div className="mt-4">
        <h1 className="font-display text-3xl tracking-tight text-ink">
          {item.originalFilename || "Photo"}
        </h1>
        <p className="mt-1 font-mono text-[11px] text-ink-muted">{item.id}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded bg-ink/5 px-2 py-0.5 text-[11px] uppercase text-ink-muted">
            {item.moderationStatus}
          </span>
          <span className="rounded bg-ink/5 px-2 py-0.5 text-[11px] uppercase text-ink-muted">
            {item.status}
          </span>
          {item.contentBlocked ? (
            <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-medium uppercase text-red-800">
              Content blocked
            </span>
          ) : null}
        </div>
      </div>

      {item.contentBlocked ? (
        <div className="mt-6 flex gap-3 rounded-lg border border-red-300/40 bg-red-50 px-4 py-4 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Metadata only</p>
            <p className="mt-1 text-red-800/90">
              This item is quarantined or under a quarantine storage prefix.
              Previews and download URLs are never generated from this screen.
              Inspection is logged.
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-ink-muted">
          This view shows metadata only (no media bytes). Use the review queue
          for borderline human review with blurred previews.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-xl text-ink">Details</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Owner</dt>
              <dd className="text-ink">
                {item.ownerDisplayName || item.ownerEmail || item.userId}
              </dd>
              {item.ownerEmail ? (
                <dd className="text-xs text-ink-muted">{item.ownerEmail}</dd>
              ) : null}
            </div>
            <div>
              <dt className="text-ink-muted">Type</dt>
              <dd className="text-ink">
                {item.type} · {item.contentType}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Size</dt>
              <dd className="text-ink">
                {item.byteSize != null ? formatBytes(item.byteSize, 1) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Dimensions</dt>
              <dd className="text-ink">
                {item.width && item.height
                  ? `${item.width}×${item.height}`
                  : "—"}
                {item.durationMs != null
                  ? ` · ${(item.durationMs / 1000).toFixed(1)}s`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">PhotoDNA</dt>
              <dd className="text-ink">
                {item.photodnaMatch ? "Match" : "No match"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">AI scores</dt>
              <dd className="text-ink">
                CSAM {score(item.aiCsamScore)} · nudity{" "}
                {score(item.aiNudityScore)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Quarantined</dt>
              <dd className="text-ink">{formatWhen(item.quarantinedAt)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">NCMEC</dt>
              <dd className="text-ink">{item.ncmecReportId || "—"}</dd>
              {item.ncmecReportedAt ? (
                <dd className="text-xs text-ink-muted">
                  {formatWhen(item.ncmecReportedAt)}
                </dd>
              ) : null}
            </div>
            <div>
              <dt className="text-ink-muted">Created</dt>
              <dd className="text-ink">{formatWhen(item.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Updated</dt>
              <dd className="text-ink">{formatWhen(item.updatedAt)}</dd>
            </div>
          </dl>

          {item.moderationLabels?.labels?.length ? (
            <p className="mt-4 text-xs text-ink-muted">
              Labels: {item.moderationLabels.labels.join(", ")}
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="font-display text-xl text-ink">Storage (safe)</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-ink-muted">Quarantine prefix</dt>
              <dd className="text-ink">
                {item.storage.underQuarantinePrefix ? "Yes" : "No"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Key hint</dt>
              <dd className="break-all font-mono text-xs text-ink">
                {item.storage.keyHint || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Derivatives</dt>
              <dd className="text-ink">
                processed: {item.storage.hasProcessedDerivative ? "yes" : "no"}
                {" · "}
                thumbnail: {item.storage.hasThumbnail ? "yes" : "no"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl text-ink">Moderation history</h2>
        {item.recentEvents.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No events yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink/8 rounded-lg border border-ink/10">
            {item.recentEvents.map((ev) => (
              <li key={ev.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ink">
                    {ev.eventType}
                    {ev.previousModerationStatus || ev.newModerationStatus
                      ? ` (${ev.previousModerationStatus ?? "—"} → ${ev.newModerationStatus ?? "—"})`
                      : ""}
                  </p>
                  <span className="text-xs text-ink-muted">
                    {formatWhen(ev.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {ev.source}
                  {ev.actorEmail ? ` · ${ev.actorEmail}` : ""}
                  {ev.actorId && !ev.actorEmail
                    ? ` · ${ev.actorId.slice(0, 12)}`
                    : ""}
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
