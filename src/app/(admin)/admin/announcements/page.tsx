import { AnnouncementComposeForm } from "@/components/admin/AnnouncementComposeForm";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();

  return (
    <div>
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Announcements
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Send a “What’s new” email to users who opted in to product updates.
          Automated feature tips are separate and run via the lifecycle-emails
          job.
        </p>
      </div>

      <section className="mt-8 rounded-lg border border-ink/10 bg-canvas-deep/30 px-4 py-5 sm:px-6">
        <h2 className="font-display text-xl text-ink">Compose</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Subject is fixed: What’s new in Family Memory Vault. Recipients who
          turned off product updates are never emailed.
        </p>
        <AnnouncementComposeForm />
      </section>
    </div>
  );
}
