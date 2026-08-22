import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreateMemoryForm } from "@/components/memories/CreateMemoryForm";
import { getSafeMediaLibrary } from "@/lib/media/queries";
import { getPersonWithPhotos } from "@/lib/people/queries";
import { getTranslations } from "@/lib/i18n/server";

type PageProps = {
  searchParams: Promise<{
    fromPerson?: string;
    intent?: string;
    mediaIds?: string;
  }>;
};

export default async function CreateMemoryPage({ searchParams }: PageProps) {
  const { userId, isAuthenticated } = await auth();
  if (!isAuthenticated || !userId) {
    redirect("/");
  }

  const t = await getTranslations();
  const params = await searchParams;
  const fromPersonId = params.fromPerson?.trim() || null;
  const intentMovie = params.intent === "movie";
  const preselectedIds = (params.mediaIds ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 40);

  const needsSharedForPreselect = preselectedIds.length > 0;
  const libraryBundle = await getSafeMediaLibrary(userId, {
    ownLimit: 120,
    sharedLimit: needsSharedForPreselect ? 80 : 0,
  });
  let library = needsSharedForPreselect
    ? [...libraryBundle.own, ...libraryBundle.shared]
    : libraryBundle.own;
  let initialTitle = "";
  let initialMediaIds: string[] = [];
  let initialCoverMediaId: string | null = null;
  let sourceHint: string | null = intentMovie ? t("pages.movieIntentHint") : null;
  let backHref = "/memories";
  let backLabel = "Back to memories";

  if (preselectedIds.length > 0) {
    const libraryIds = new Set(library.map((item) => item.id));
    initialMediaIds = preselectedIds.filter((id) => libraryIds.has(id));
    initialCoverMediaId = initialMediaIds[0] ?? null;
    if (!sourceHint) {
      sourceHint = t("onThisDay.preselectedHint");
    }
  }

  if (fromPersonId) {
    const person = await getPersonWithPhotos(fromPersonId, userId);
    if (person) {
      backHref = `/people/${person.id}`;
      backLabel = `Back to ${person.displayName}`;
      initialTitle =
        person.displayName === "Unnamed Person"
          ? "Family moments"
          : `Moments with ${person.displayName}`;
      initialMediaIds = person.photos.map((p) => p.id);
      initialCoverMediaId = person.cover?.mediaId ?? person.photos[0]?.id ?? null;
      sourceHint = `Pre-selected from ${person.displayName}'s photos. Adjust the selection or cover before saving.`;

      const libraryIds = new Set(library.map((item) => item.id));
      const missing = person.photos.filter((p) => !libraryIds.has(p.id));
      if (missing.length > 0) {
        library = [
          ...missing.map((p) => ({
            id: p.id,
            userId: p.userId,
            type: p.type,
            contentType: p.contentType,
            originalFilename: p.originalFilename,
            createdAt: p.createdAt,
            previewUrl: p.previewUrl,
            hasThumbnail: p.hasThumbnail,
          })),
          ...library,
        ];
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {backLabel}
      </Link>

      <header className="mt-4">
        <h1 className="page-title font-display text-3xl tracking-tight text-ink">
          {intentMovie ? t("pages.moviesMake") : "Create memory"}
        </h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed text-ink-muted">
          {intentMovie
            ? t("pages.movieIntentHint")
            : "Group photos and videos that have already passed safety checks into an album you can revisit together."}
        </p>
      </header>

      <div className="mt-8">
        <CreateMemoryForm
          library={library}
          initialTitle={initialTitle}
          initialMediaIds={initialMediaIds}
          initialCoverMediaId={initialCoverMediaId}
          sourceHint={sourceHint}
          intentMovie={intentMovie}
        />
      </div>
    </div>
  );
}
